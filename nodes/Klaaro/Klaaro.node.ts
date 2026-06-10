import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	documentRecordsPathForFormat,
	getDatasets,
	klaaroApiRequest,
	klaaroApiRequestAllItems,
	recordPathForFormat,
	singleRecordPathForFormat,
	sleep,
} from './GenericFunctions';
import type { RecordFormat } from './GenericFunctions';
import { KLAARO_NODE_ICON } from './icon';

const DOCUMENT_STATUSES = ['queued', 'processing', 'completed', 'failed', 'cancelled'] as const;
const APPROVAL_STATUSES = ['pending', 'approved', 'approved_with_changes', 'rejected'] as const;

export class Klaaro implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Klaaro',
		name: 'klaaro',
		icon: KLAARO_NODE_ICON,
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Interact with the Klaaro document extraction API',
		defaults: {
			name: 'Klaaro',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'klaaroApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Document', value: 'document' },
					{ name: 'Dataset', value: 'dataset' },
					{ name: 'Record', value: 'record' },
				],
				default: 'document',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['document'],
					},
				},
				options: [
					{ name: 'Delete', value: 'delete', action: 'Delete a document' },
					{ name: 'Get', value: 'get', action: 'Get a document' },
					{ name: 'List', value: 'getAll', action: 'List documents' },
					{ name: 'Get Records', value: 'getRecords', action: 'Get records for a document' },
					{ name: 'Upload', value: 'upload', action: 'Upload a document' },
				],
				default: 'upload',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['dataset'],
					},
				},
				options: [
					{ name: 'Get', value: 'get', action: 'Get a dataset' },
					{ name: 'Get Approval Queue', value: 'getApprovalQueue', action: 'Get approval queue' },
					{ name: 'Get Class', value: 'getClass', action: 'Get a dataset class' },
					{ name: 'Get Classes', value: 'getClasses', action: 'Get dataset classes' },
					{ name: 'List', value: 'getAll', action: 'List datasets' },
					{ name: 'Get Records', value: 'getRecords', action: 'Get dataset records' },
				],
				default: 'getAll',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['record'],
					},
				},
				options: [
					{ name: 'Get', value: 'get', action: 'Get a record' },
					{ name: 'Get Approvals', value: 'getApprovals', action: 'Get record approvals' },
					{ name: 'Get Comments', value: 'getComments', action: 'Get record comments' },
					{ name: 'Get Field Events', value: 'getFieldEvents', action: 'Get record field events' },
				],
				default: 'get',
			},
			{
				displayName: 'Dataset',
				name: 'datasetId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getDatasets',
				},
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['upload'],
					},
				},
			},
			{
				displayName: 'Upload Source',
				name: 'uploadSource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Binary File', value: 'binary' },
					{ name: 'URL', value: 'url' },
				],
				default: 'binary',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['upload'],
					},
				},
			},
			{
				displayName: 'Input Binary Field',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				description: 'Name of the binary property containing the file to upload',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['upload'],
						uploadSource: ['binary'],
					},
				},
			},
			{
				displayName: 'File URL',
				name: 'fileUrl',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['upload'],
						uploadSource: ['url'],
					},
				},
			},
			{
				displayName: 'Filename',
				name: 'filename',
				type: 'string',
				default: '',
				description: 'Override filename for binary uploads',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['upload'],
						uploadSource: ['binary'],
					},
				},
			},
			{
				displayName: 'Fixed Class',
				name: 'fixedClass',
				type: 'string',
				default: '',
				description: 'Force a specific class slug for extraction',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['upload'],
					},
				},
			},
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['upload'],
					},
				},
			},
			{
				displayName: 'Replace Document ID',
				name: 'replaceDocumentId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['upload'],
					},
				},
			},
			{
				displayName: 'Wait Until Done',
				name: 'waitUntilDone',
				type: 'boolean',
				default: true,
				description: 'Whether to poll until the document reaches a terminal status',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['upload'],
					},
				},
			},
			{
				displayName: 'Include Records on Success',
				name: 'includeRecords',
				type: 'boolean',
				default: true,
				description: 'Whether to fetch extracted records when processing completes',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['upload'],
						waitUntilDone: [true],
					},
				},
			},
			{
				displayName: 'Record Format',
				name: 'uploadRecordFormat',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Clean', value: 'clean' },
					{ name: 'Flat', value: 'flat' },
					{ name: 'Nested', value: 'nested' },
				],
				default: 'clean',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['upload'],
						waitUntilDone: [true],
						includeRecords: [true],
					},
				},
			},
			{
				displayName: 'Polling Interval (Seconds)',
				name: 'pollingInterval',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 3,
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['upload'],
						waitUntilDone: [true],
					},
				},
			},
			{
				displayName: 'Timeout (Seconds)',
				name: 'timeout',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 300,
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['upload'],
						waitUntilDone: [true],
					},
				},
			},
			{
				displayName: 'Document ID',
				name: 'documentId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['get', 'delete', 'getRecords'],
					},
				},
			},
			{
				displayName: 'Dataset',
				name: 'datasetId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getDatasets',
				},
				default: '',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['getAll'],
					},
				},
			},
			{
				displayName: 'Class',
				name: 'classSlug',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['getAll'],
					},
				},
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: DOCUMENT_STATUSES.map((value) => ({ name: value, value })),
				default: '',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['getAll'],
					},
				},
			},
			{
				displayName: 'Created After',
				name: 'createdAfter',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['getAll'],
					},
				},
			},
			{
				displayName: 'Created Before',
				name: 'createdBefore',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['getAll'],
					},
				},
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['document', 'dataset', 'record'],
						operation: ['getAll', 'getRecords', 'getClasses', 'getApprovalQueue', 'getFieldEvents', 'getComments', 'getApprovals'],
					},
				},
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: {
					minValue: 1,
					maxValue: 200,
				},
				default: 50,
				description: 'Max number of results to return',
				displayOptions: {
					show: {
						resource: ['document', 'dataset', 'record'],
						operation: ['getAll', 'getRecords', 'getClasses', 'getApprovalQueue', 'getFieldEvents', 'getComments', 'getApprovals'],
						returnAll: [false],
					},
				},
			},
			{
				displayName: 'Record Format',
				name: 'recordFormat',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Clean', value: 'clean' },
					{ name: 'Flat', value: 'flat' },
					{ name: 'Nested', value: 'nested' },
				],
				default: 'clean',
				displayOptions: {
					show: {
						resource: ['document', 'dataset', 'record'],
						operation: ['getRecords', 'get'],
					},
				},
			},
			{
				displayName: 'Include Unapproved',
				name: 'includeUnapproved',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['getRecords'],
					},
				},
			},
			{
				displayName: 'Dataset ID',
				name: 'datasetId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['dataset'],
						operation: ['get', 'getRecords', 'getClasses', 'getClass', 'getApprovalQueue'],
					},
				},
			},
			{
				displayName: 'Class Slug',
				name: 'classSlug',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['dataset'],
						operation: ['getRecords', 'getClass'],
					},
				},
			},
			{
				displayName: 'Approval Status',
				name: 'approval',
				type: 'options',
				options: APPROVAL_STATUSES.map((value) => ({ name: value, value })),
				default: '',
				displayOptions: {
					show: {
						resource: ['dataset'],
						operation: ['getRecords'],
					},
				},
			},
			{
				displayName: 'Created After',
				name: 'createdAfter',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['dataset'],
						operation: ['getRecords'],
					},
				},
			},
			{
				displayName: 'Created Before',
				name: 'createdBefore',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['dataset'],
						operation: ['getRecords'],
					},
				},
			},
			{
				displayName: 'Queue Status',
				name: 'queueStatus',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['dataset'],
						operation: ['getApprovalQueue'],
					},
				},
			},
			{
				displayName: 'Record ID',
				name: 'recordId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['record'],
						operation: ['get', 'getFieldEvents', 'getComments', 'getApprovals'],
					},
				},
			},
			{
				displayName: 'Comments Scope',
				name: 'commentsScopeHint',
				type: 'notice',
				default:
					'Get Comments returns record-level comments only. For field comments, use Get Field Events with Event Kinds set to "comment".',
				displayOptions: {
					show: {
						resource: ['record'],
						operation: ['getComments'],
					},
				},
			},
			{
				displayName: 'Field Path',
				name: 'fieldPath',
				type: 'string',
				default: '',
				description: 'Optional. Filter to one field path. Leave empty to return all fields.',
				displayOptions: {
					show: {
						resource: ['record'],
						operation: ['getFieldEvents'],
					},
				},
			},
			{
				displayName: 'Event Kinds',
				name: 'eventKinds',
				type: 'string',
				default: '',
				description: 'Comma-separated kinds to filter by, e.g. "comment" for field comments',
				displayOptions: {
					show: {
						resource: ['record'],
						operation: ['getFieldEvents'],
					},
				},
			},
		],
	};

	methods = {
		loadOptions: {
			getDatasets,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as string;
				const operation = this.getNodeParameter('operation', itemIndex) as string;
				let responseData: IDataObject | IDataObject[];

				if (resource === 'document') {
					responseData = await handleDocumentOperation.call(this, operation, itemIndex);
				} else if (resource === 'dataset') {
					responseData = await handleDatasetOperation.call(this, operation, itemIndex);
				} else if (resource === 'record') {
					responseData = await handleRecordOperation.call(this, operation, itemIndex);
				} else {
					throw new NodeOperationError(this.getNode(), `Unknown resource: ${resource}`, {
						itemIndex,
					});
				}

				const executionItems = Array.isArray(responseData)
					? responseData.map((json) => ({ json }))
					: [{ json: responseData }];

				returnData.push(...executionItems);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: itemIndex },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}

async function handleDocumentOperation(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject | IDataObject[]> {
	if (operation === 'upload') {
		return uploadDocument.call(this, itemIndex);
	}

	if (operation === 'get') {
		const documentId = this.getNodeParameter('documentId', itemIndex) as string;
		return (await klaaroApiRequest.call(this, 'GET', `/documents/${documentId}`)) as IDataObject;
	}

	if (operation === 'delete') {
		const documentId = this.getNodeParameter('documentId', itemIndex) as string;
		await klaaroApiRequest.call(this, 'DELETE', `/documents/${documentId}`);
		return { success: true, documentId };
	}

	if (operation === 'getRecords') {
		const documentId = this.getNodeParameter('documentId', itemIndex) as string;
		const recordFormat = this.getNodeParameter('recordFormat', itemIndex) as RecordFormat;
		const includeUnapproved = this.getNodeParameter('includeUnapproved', itemIndex) as boolean;
		const recordsPath = documentRecordsPathForFormat(recordFormat);
		const qs: IDataObject = {};
		if (includeUnapproved) qs.includeUnapproved = 'true';
		return (await klaaroApiRequest.call(this, 'GET', `/documents/${documentId}/${recordsPath}`, undefined, qs)) as IDataObject;
	}

	if (operation === 'getAll') {
		const returnAll = this.getNodeParameter('returnAll', itemIndex) as boolean;
		const qs = buildDocumentListQuery.call(this, itemIndex);

		if (returnAll) {
			return await klaaroApiRequestAllItems.call(this, 'GET', '/documents', qs);
		}

		const limit = this.getNodeParameter('limit', itemIndex) as number;
		const response = await klaaroApiRequest.call(this, 'GET', '/documents', undefined, { ...qs, limit });
		return (response.data as IDataObject[]) ?? [];
	}

	throw new NodeOperationError(this.getNode(), `Unknown document operation: ${operation}`, { itemIndex });
}

async function uploadDocument(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const datasetId = this.getNodeParameter('datasetId', itemIndex) as string;
	const uploadSource = this.getNodeParameter('uploadSource', itemIndex) as string;
	const fixedClass = (this.getNodeParameter('fixedClass', itemIndex) as string).trim();
	const idempotencyKey = (this.getNodeParameter('idempotencyKey', itemIndex) as string).trim();
	const replaceDocumentId = (this.getNodeParameter('replaceDocumentId', itemIndex) as string).trim();
	const waitUntilDone = this.getNodeParameter('waitUntilDone', itemIndex) as boolean;

	const headers: IDataObject = {};
	if (idempotencyKey) {
		headers['Idempotency-Key'] = idempotencyKey;
	}

	let document: IDataObject;

	if (uploadSource === 'url') {
		const url = this.getNodeParameter('fileUrl', itemIndex) as string;
		const body: IDataObject = { datasetId, url };
		if (fixedClass) body.fixedClass = fixedClass;
		if (replaceDocumentId) body.replaceDocumentId = replaceDocumentId;
		document = await klaaroApiRequest.call(this, 'POST', '/documents', body, undefined, headers);
	} else {
		const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex) as string;
		const filenameOverride = (this.getNodeParameter('filename', itemIndex) as string).trim();
		const binaryData = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
		const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
		const filename = filenameOverride || binaryData.fileName || 'upload';
		const mimeType = binaryData.mimeType || 'application/octet-stream';

		const form = new FormData();
		form.append('datasetId', datasetId);
		form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);
		if (fixedClass) form.append('fixedClass', fixedClass);
		if (replaceDocumentId) form.append('replaceDocumentId', replaceDocumentId);

		document = await klaaroApiRequest.call(this, 'POST', '/documents', form, undefined, headers);
	}

	if (!waitUntilDone) {
		return document;
	}

	const pollingInterval = (this.getNodeParameter('pollingInterval', itemIndex) as number) * 1000;
	const timeout = (this.getNodeParameter('timeout', itemIndex) as number) * 1000;
	const includeRecords = this.getNodeParameter('includeRecords', itemIndex) as boolean;
	const recordFormat = this.getNodeParameter('uploadRecordFormat', itemIndex) as RecordFormat;
	const documentId = document.id as string;

	document = await waitForDocument.call(this, documentId, timeout, pollingInterval, itemIndex);

	if (document.status === 'failed' || document.status === 'cancelled') {
		throw new NodeOperationError(
			this.getNode(),
			`Document processing ${document.status as string}: ${(document.error as string) ?? 'unknown error'}`,
			{ itemIndex },
		);
	}

	if (!includeRecords) {
		return document;
	}

	const recordsPath = documentRecordsPathForFormat(recordFormat);
	const recordsResponse = (await klaaroApiRequest.call(
		this,
		'GET',
		`/documents/${documentId}/${recordsPath}`,
	)) as IDataObject;

	return {
		...document,
		records: recordsResponse.records,
		class: recordsResponse.class,
	};
}

async function waitForDocument(
	this: IExecuteFunctions,
	documentId: string,
	timeoutMs: number,
	intervalMs: number,
	itemIndex: number,
): Promise<IDataObject> {
	const terminalStatuses = new Set(['completed', 'failed', 'cancelled']);
	const startedAt = Date.now();

	while (Date.now() - startedAt < timeoutMs) {
		const document = (await klaaroApiRequest.call(this, 'GET', `/documents/${documentId}`)) as IDataObject;
		if (terminalStatuses.has(document.status as string)) {
			return document;
		}
		await sleep(intervalMs);
	}

	throw new NodeOperationError(this.getNode(), `Timed out waiting for document ${documentId}`, { itemIndex });
}

function buildDocumentListQuery(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const qs: IDataObject = {};
	const datasetId = (this.getNodeParameter('datasetId', itemIndex) as string).trim();
	const classSlug = (this.getNodeParameter('classSlug', itemIndex) as string).trim();
	const status = this.getNodeParameter('status', itemIndex) as string;
	const createdAfter = this.getNodeParameter('createdAfter', itemIndex) as string;
	const createdBefore = this.getNodeParameter('createdBefore', itemIndex) as string;

	if (datasetId) qs.datasetId = datasetId;
	if (classSlug) qs.class = classSlug;
	if (status) qs.status = status;
	if (createdAfter) qs.createdAfter = createdAfter;
	if (createdBefore) qs.createdBefore = createdBefore;

	return qs;
}

async function handleDatasetOperation(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject | IDataObject[]> {
	const datasetId = this.getNodeParameter('datasetId', itemIndex) as string;

	if (operation === 'get') {
		return (await klaaroApiRequest.call(this, 'GET', `/datasets/${datasetId}`)) as IDataObject;
	}

	if (operation === 'getAll') {
		const returnAll = this.getNodeParameter('returnAll', itemIndex) as boolean;
		if (returnAll) {
			return await klaaroApiRequestAllItems.call(this, 'GET', '/datasets');
		}
		const limit = this.getNodeParameter('limit', itemIndex) as number;
		const response = await klaaroApiRequest.call(this, 'GET', '/datasets', undefined, { limit });
		return (response.data as IDataObject[]) ?? [];
	}

	if (operation === 'getClasses') {
		const returnAll = this.getNodeParameter('returnAll', itemIndex) as boolean;
		if (returnAll) {
			return await klaaroApiRequestAllItems.call(this, 'GET', `/datasets/${datasetId}/classes`);
		}
		const limit = this.getNodeParameter('limit', itemIndex) as number;
		const response = await klaaroApiRequest.call(this, 'GET', `/datasets/${datasetId}/classes`, undefined, { limit });
		return (response.data as IDataObject[]) ?? [];
	}

	if (operation === 'getClass') {
		const classSlug = this.getNodeParameter('classSlug', itemIndex) as string;
		return (await klaaroApiRequest.call(
			this,
			'GET',
			`/datasets/${datasetId}/classes/${encodeURIComponent(classSlug)}`,
		)) as IDataObject;
	}

	if (operation === 'getRecords') {
		const recordFormat = this.getNodeParameter('recordFormat', itemIndex) as RecordFormat;
		const returnAll = this.getNodeParameter('returnAll', itemIndex) as boolean;
		const recordsPath = recordPathForFormat(recordFormat, true);
		const qs = buildDatasetRecordsQuery.call(this, itemIndex);

		if (returnAll) {
			return await klaaroApiRequestAllItems.call(this, 'GET', `/datasets/${datasetId}/${recordsPath}`, qs);
		}

		const limit = this.getNodeParameter('limit', itemIndex) as number;
		const response = await klaaroApiRequest.call(this, 'GET', `/datasets/${datasetId}/${recordsPath}`, undefined, {
			...qs,
			limit,
		});
		return (response.data as IDataObject[]) ?? [];
	}

	if (operation === 'getApprovalQueue') {
		const returnAll = this.getNodeParameter('returnAll', itemIndex) as boolean;
		const queueStatus = (this.getNodeParameter('queueStatus', itemIndex) as string).trim();
		const qs: IDataObject = {};
		if (queueStatus) qs.status = queueStatus;

		if (returnAll) {
			return await klaaroApiRequestAllItems.call(this, 'GET', `/datasets/${datasetId}/approval-queue`, qs);
		}

		const limit = this.getNodeParameter('limit', itemIndex) as number;
		const response = await klaaroApiRequest.call(
			this,
			'GET',
			`/datasets/${datasetId}/approval-queue`,
			undefined,
			{ ...qs, limit },
		);
		return (response.data as IDataObject[]) ?? [];
	}

	throw new NodeOperationError(this.getNode(), `Unknown dataset operation: ${operation}`, { itemIndex });
}

function buildDatasetRecordsQuery(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const qs: IDataObject = {};
	const classSlug = (this.getNodeParameter('classSlug', itemIndex) as string).trim();
	const approval = this.getNodeParameter('approval', itemIndex) as string;
	const createdAfter = this.getNodeParameter('createdAfter', itemIndex) as string;
	const createdBefore = this.getNodeParameter('createdBefore', itemIndex) as string;

	if (classSlug) qs.class = classSlug;
	if (approval) qs.approval = approval;
	if (createdAfter) qs.createdAfter = createdAfter;
	if (createdBefore) qs.createdBefore = createdBefore;

	return qs;
}

async function handleRecordOperation(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject | IDataObject[]> {
	const recordId = this.getNodeParameter('recordId', itemIndex) as string;

	if (operation === 'get') {
		const recordFormat = this.getNodeParameter('recordFormat', itemIndex) as RecordFormat;
		const path = singleRecordPathForFormat(recordFormat);
		return (await klaaroApiRequest.call(this, 'GET', `${path}/${recordId}`)) as IDataObject;
	}

	if (operation === 'getFieldEvents') {
		const returnAll = this.getNodeParameter('returnAll', itemIndex) as boolean;
		const fieldPath = (this.getNodeParameter('fieldPath', itemIndex) as string).trim();
		const eventKinds = (this.getNodeParameter('eventKinds', itemIndex) as string).trim();
		const qs: IDataObject = {};
		if (fieldPath) qs.fieldPath = fieldPath;
		if (eventKinds) qs.kinds = eventKinds;

		if (returnAll) {
			return await klaaroApiRequestAllItems.call(this, 'GET', `/records/${recordId}/field-events`, qs);
		}

		const limit = this.getNodeParameter('limit', itemIndex) as number;
		const response = await klaaroApiRequest.call(this, 'GET', `/records/${recordId}/field-events`, undefined, {
			...qs,
			limit,
		});
		return (response.data as IDataObject[]) ?? [];
	}

	if (operation === 'getComments') {
		const returnAll = this.getNodeParameter('returnAll', itemIndex) as boolean;
		if (returnAll) {
			return await klaaroApiRequestAllItems.call(this, 'GET', `/records/${recordId}/comments`);
		}
		const limit = this.getNodeParameter('limit', itemIndex) as number;
		const response = await klaaroApiRequest.call(this, 'GET', `/records/${recordId}/comments`, undefined, { limit });
		return (response.data as IDataObject[]) ?? [];
	}

	if (operation === 'getApprovals') {
		const returnAll = this.getNodeParameter('returnAll', itemIndex) as boolean;
		if (returnAll) {
			return await klaaroApiRequestAllItems.call(this, 'GET', `/records/${recordId}/approvals`);
		}
		const limit = this.getNodeParameter('limit', itemIndex) as number;
		const response = await klaaroApiRequest.call(this, 'GET', `/records/${recordId}/approvals`, undefined, { limit });
		return (response.data as IDataObject[]) ?? [];
	}

	throw new NodeOperationError(this.getNode(), `Unknown record operation: ${operation}`, { itemIndex });
}
