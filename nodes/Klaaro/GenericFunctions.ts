import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IWebhookFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export const KLAARO_API_BASE = 'https://klaaro.ai/api/v1';
export const KLAARO_CREDENTIAL_TYPE = 'klaaroApi';

export type KlaaroRequestContext =
	| IExecuteFunctions
	| ILoadOptionsFunctions
	| IHookFunctions
	| IWebhookFunctions;

export type RecordFormat = 'clean' | 'flat' | 'nested';

export const RECORD_FORMATS: RecordFormat[] = ['clean', 'flat', 'nested'];

export const WEBHOOK_EVENTS = [
	'document.ocr_completed',
	'document.extraction_completed',
	'document.failed',
	'document.uploaded',
	'record.updated',
	'record.approved',
	'evaluation.completed',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

interface KlaaroListMeta {
	nextCursor?: string | null;
	hasMore?: boolean;
}

interface KlaaroListResponse<T> {
	data: T[];
	meta: KlaaroListMeta;
}

interface KlaaroErrorBody {
	error?: {
		code?: string;
		message?: string;
		param?: string;
		requestId?: string;
	};
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function recordPathForFormat(format: RecordFormat, datasetScoped = false): string {
	if (datasetScoped) {
		if (format === 'flat') return 'records-flat';
		if (format === 'nested') return 'records-nested';
		return 'records';
	}
	if (format === 'flat') return 'records-flat';
	if (format === 'nested') return 'records-nested';
	return 'records';
}

export function singleRecordPathForFormat(format: RecordFormat): string {
	if (format === 'flat') return '/records-flat';
	if (format === 'nested') return '/records-nested';
	return '/records';
}

export function documentRecordsPathForFormat(format: RecordFormat): string {
	if (format === 'flat') return 'records-flat';
	if (format === 'nested') return 'records-nested';
	return 'records';
}

export async function klaaroApiRequest(
	this: KlaaroRequestContext,
	method: IHttpRequestOptions['method'],
	endpoint: string,
	body?: IDataObject | FormData,
	qs?: IDataObject,
	headers?: IDataObject,
): Promise<IDataObject> {
	const options: IHttpRequestOptions = {
		method,
		url: `${KLAARO_API_BASE}${endpoint}`,
		json: true,
	};

	if (qs && Object.keys(qs).length > 0) {
		options.qs = qs;
	}

	if (body !== undefined) {
		options.body = body;
	}

	if (headers && Object.keys(headers).length > 0) {
		options.headers = headers;
	}

	try {
		return (await this.helpers.httpRequestWithAuthentication.call(
			this,
			KLAARO_CREDENTIAL_TYPE,
			options,
		)) as IDataObject;
	} catch (error) {
		if (error instanceof NodeApiError) {
			throw error;
		}

		const err = error as JsonObject & { response?: { body?: KlaaroErrorBody; statusCode?: number } };
		const apiError = err.response?.body?.error;
		const message = apiError?.message ?? (error as Error).message ?? 'Klaaro API request failed';

		throw new NodeApiError(this.getNode(), error as JsonObject, {
			message,
			description: apiError?.code,
			httpCode: err.response?.statusCode ? String(err.response.statusCode) : undefined,
		});
	}
}

export async function klaaroApiRequestAllItems(
	this: KlaaroRequestContext,
	method: IHttpRequestOptions['method'],
	endpoint: string,
	qs: IDataObject = {},
	limit = 200,
): Promise<IDataObject[]> {
	const items: IDataObject[] = [];
	let cursor: string | undefined;

	do {
		const response = (await klaaroApiRequest.call(this, method, endpoint, undefined, {
			...qs,
			limit,
			...(cursor ? { cursor } : {}),
		})) as unknown as KlaaroListResponse<IDataObject>;

		items.push(...(response.data ?? []));
		cursor = response.meta?.hasMore ? (response.meta.nextCursor ?? undefined) : undefined;
	} while (cursor);

	return items;
}

export async function getDatasets(this: ILoadOptionsFunctions) {
	const response = (await klaaroApiRequest.call(this, 'GET', '/datasets', undefined, {
		limit: 200,
	})) as unknown as KlaaroListResponse<IDataObject>;

	return (response.data ?? []).map((dataset) => ({
		name: (dataset.name as string) ?? (dataset.slug as string) ?? (dataset.id as string),
		value: dataset.id as string,
	}));
}
