const path = require('path');
const { src, dest } = require('gulp');

function copyIcons() {
	const nodeSource = path.resolve('nodes', '**', '*.{png,svg}');
	const nodeDestination = path.resolve('dist', 'nodes');

	const credSource = path.resolve('credentials', '**', '*.{png,svg}');
	const credDestination = path.resolve('dist', 'credentials');

	const copyNodes = src(nodeSource).pipe(dest(nodeDestination));
	const copyCredentials = src(credSource).pipe(dest(credDestination));

	return Promise.all([copyNodes, copyCredentials]);
}

exports['build:icons'] = copyIcons;
