import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

import { KLAARO_API_BASE } from '../nodes/Klaaro/GenericFunctions';

export class KlaaroApi implements ICredentialType {
	name = 'klaaroApi';

	displayName = 'Klaaro';

	documentationUrl = 'https://klaaro.ai/docs';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: KLAARO_API_BASE,
			url: '/datasets',
			qs: {
				limit: 1,
			},
		},
	};
}
