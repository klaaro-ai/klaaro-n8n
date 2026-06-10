import { createHmac, timingSafeEqual } from 'crypto';
import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError, NodeApiError } from 'n8n-workflow';

import {
	getDatasets,
	klaaroApiRequest,
	WEBHOOK_EVENTS,
} from '../Klaaro/GenericFunctions';
import type { WebhookEvent } from '../Klaaro/GenericFunctions';
import { KLAARO_TRIGGER_ICON } from '../Klaaro/icon';

interface KlaaroWebhookStaticData extends IDataObject {
	webhookId?: string;
	signingSecret?: string;
	datasetId?: string;
}

interface KlaaroWebhookListResponse {
	data?: Array<{
		id: string;
		url: string;
		events: string[];
	}>;
}

interface KlaaroCreateWebhookResponse {
	id: string;
	signingSecret?: string;
}

type RequestWithRawBody = {
	rawBody?: Buffer | string;
	body?: unknown;
};

export class KlaaroTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Klaaro Trigger',
		name: 'klaaroTrigger',
		icon: KLAARO_TRIGGER_ICON,
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description:
			'Starts the workflow when Klaaro sends webhook events. In test mode, click "Listen for test event" first — the listener stays open for about 2 minutes.',
		defaults: {
			name: 'Klaaro Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'klaaroApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'klaaro',
			},
		],
		properties: [
			{
				displayName: 'Dataset',
				name: 'datasetId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getDatasets',
				},
				required: true,
				default: '',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				options: WEBHOOK_EVENTS.map((event) => ({
					name: event,
					value: event,
				})),
				default: ['document.extraction_completed', 'document.failed', 'record.updated'],
				required: true,
			},
			{
				displayName: 'Test Mode Hint',
				name: 'testModeHint',
				type: 'notice',
				displayOptions: {
					show: {
						'@version': [1],
					},
				},
				default:
					'Test mode only captures events while the test listener is open. Click "Listen for test event", then trigger the event in Klaaro within ~2 minutes.',
			},
		],
	};

	methods = {
		loadOptions: {
			getDatasets,
		},
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node') as KlaaroWebhookStaticData;
				const webhookUrl = this.getNodeWebhookUrl('default');
				const datasetId = this.getNodeParameter('datasetId') as string;
				const events = this.getNodeParameter('events') as WebhookEvent[];

				if (!webhookUrl) {
					return false;
				}

				const response = (await klaaroApiRequest.call(
					this,
					'GET',
					'/webhooks',
					undefined,
					{ datasetId },
				)) as KlaaroWebhookListResponse;

				const existing = (response.data ?? []).find((hook) => {
					if (hook.url !== webhookUrl) return false;
					const hookEvents = new Set(hook.events ?? []);
					return events.every((event) => hookEvents.has(event));
				});

				if (!existing) {
					return false;
				}

				webhookData.webhookId = existing.id;
				webhookData.datasetId = datasetId;
				return true;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node') as KlaaroWebhookStaticData;
				const webhookUrl = this.getNodeWebhookUrl('default');
				const datasetId = this.getNodeParameter('datasetId') as string;
				const events = this.getNodeParameter('events') as WebhookEvent[];

				if (!webhookUrl) {
					throw new NodeOperationError(this.getNode(), 'Webhook URL is not available');
				}

				const response = (await klaaroApiRequest.call(this, 'POST', '/webhooks', {
					datasetId,
					url: webhookUrl,
					events,
					description: 'n8n Klaaro Trigger',
				})) as unknown as KlaaroCreateWebhookResponse;

				webhookData.webhookId = response.id;
				webhookData.datasetId = datasetId;
				if (response.signingSecret) {
					webhookData.signingSecret = response.signingSecret;
				}

				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node') as KlaaroWebhookStaticData;
				const webhookId = webhookData.webhookId as string | undefined;
				const datasetId = (webhookData.datasetId as string | undefined) ?? (this.getNodeParameter('datasetId') as string);

				if (!webhookId || !datasetId) {
					return true;
				}

				try {
					await klaaroApiRequest.call(this, 'DELETE', `/webhooks/${webhookId}`, { datasetId });
				} catch (error) {
					if (!(error instanceof NodeApiError)) {
						return false;
					}
				}

				delete webhookData.webhookId;
				delete webhookData.signingSecret;
				delete webhookData.datasetId;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const webhookData = this.getWorkflowStaticData('node') as KlaaroWebhookStaticData;
		const signingSecret = webhookData.signingSecret as string | undefined;
		const signatureHeader = this.getHeaderData()['klaaro-signature'] as string | undefined;

		if (signingSecret && signatureHeader) {
			const rawBody = getRawBody(this.getRequestObject() as RequestWithRawBody);
			const parts = Object.fromEntries(
				signatureHeader.split(',').map((part) => part.split('=') as [string, string]),
			);
			const timestamp = parts['t'];
			const signature = parts['v1'];

			if (!timestamp || !signature) {
				throw new NodeOperationError(this.getNode(), 'Invalid Klaaro webhook signature');
			}

			if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
				throw new NodeOperationError(this.getNode(), 'Klaaro webhook signature expired');
			}

			const expected = createHmac('sha256', signingSecret)
				.update(`${timestamp}.${rawBody}`)
				.digest('hex');

			const expectedBuffer = Buffer.from(expected);
			const receivedBuffer = Buffer.from(signature);

			if (
				expectedBuffer.length !== receivedBuffer.length ||
				!timingSafeEqual(expectedBuffer, receivedBuffer)
			) {
				throw new NodeOperationError(this.getNode(), 'Invalid Klaaro webhook signature');
			}
		}

		const bodyData = this.getBodyData() as IDataObject;
		const headerData = this.getHeaderData();

		return {
			workflowData: [
				[
					{
						json: {
							...bodyData,
							headers: headerData,
						},
					},
				],
			],
		};
	}
}

function getRawBody(request: RequestWithRawBody): string {
	if (Buffer.isBuffer(request.rawBody)) {
		return request.rawBody.toString('utf8');
	}

	if (typeof request.rawBody === 'string') {
		return request.rawBody;
	}

	if (typeof request.body === 'string') {
		return request.body;
	}

	return JSON.stringify(request.body ?? {});
}
