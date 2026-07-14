/**
 * One-shot deploy: upgrade Groundwork Connector on a WordPress site via
 * Code Snippets REST API (when wp-admin upload is unavailable).
 *
 * Usage: bun run src/scripts/deployConnector.ts [domain]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../db';
import { decrypt } from '../crypto';

const domain = process.argv[2] ?? 'slkclinic.com';
const pluginPath = join(
	import.meta.dir,
	'../../../wordpress-connector/groundwork-connector.php',
);

function authHeader(username: string, password: string) {
	return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

async function wpFetch(
	baseUrl: string,
	auth: string,
	path: string,
	init?: RequestInit,
) {
	const url = `${baseUrl.replace(/\/$/, '')}/wp-json${path}`;
	const res = await fetch(url, {
		...init,
		headers: {
			Authorization: auth,
			'Content-Type': 'application/json',
			Accept: 'application/json',
			...init?.headers,
		},
	});
	const text = await res.text();
	let body: unknown = text;
	try {
		body = JSON.parse(text);
	} catch {
		// keep raw text
	}
	return { res, body };
}

async function main() {
	const site = await prisma.site.findFirst({ where: { domain } });
	if (!site?.wpUsername || !site.wpAppPasswordEnc) {
		throw new Error(`No WP credentials for ${domain}`);
	}

	const password = decrypt(site.wpAppPasswordEnc);
	const auth = authHeader(site.wpUsername, password);
	const baseUrl = `https://${domain}`;

	const pluginPhp = readFileSync(pluginPath, 'utf8');
	const encoded = Buffer.from(pluginPhp, 'utf8').toString('base64');

	const snippetCode = `add_action('init', function () {
	if (get_option('groundwork_connector_upgraded_140')) {
		return;
	}
	if (!defined('WP_PLUGIN_DIR')) {
		return;
	}
	$path = WP_PLUGIN_DIR . '/groundwork-connector/groundwork-connector.php';
	$content = base64_decode('${encoded}', true);
	if ($content === false) {
		return;
	}
	$dir = dirname($path);
	if (!is_dir($dir) && !wp_mkdir_p($dir)) {
		return;
	}
	if (file_put_contents($path, $content, LOCK_EX) === false) {
		return;
	}
	update_option('groundwork_connector_upgraded_140', '1.4.0', false);
}, 0);`;

	console.log(`Deploying Groundwork Connector v1.4.0 to ${domain}…`);

	const before = await wpFetch(baseUrl, auth, '/groundwork/v1/status');
	console.log('Before:', before.res.status, before.body);

	const create = await wpFetch(baseUrl, auth, '/code-snippets/v1/snippets', {
		method: 'POST',
		body: JSON.stringify({
			name: 'Groundwork Connector upgrade (auto-remove)',
			desc: 'One-time upgrade to Groundwork Connector v1.4.0. Created by Groundwork deploy script.',
			code: snippetCode,
			scope: 'global',
			active: true,
			priority: 1,
		}),
	});

	if (!create.res.ok) {
		console.error('Failed to create snippet:', create.res.status, create.body);
		process.exit(1);
	}

	const snippetId = (create.body as { id?: number }).id;
	console.log('Created snippet id:', snippetId);

	// Trigger snippet execution (init runs before REST routes).
	for (let i = 0; i < 5; i++) {
		await new Promise((r) => setTimeout(r, 1500));
		const status = await wpFetch(baseUrl, auth, '/groundwork/v1/status');
		console.log(`Probe ${i + 1}:`, status.res.status, status.body);
		if (status.res.ok) {
			const v = (status.body as { version?: string }).version;
			if (v === '1.4.0') {
				const ew = (status.body as { elementor_write?: boolean }).elementor_write;
				const sw = (status.body as { schema_write?: boolean }).schema_write;
				console.log(
					'Upgrade confirmed: v1.4.0',
					ew ? '(elementor_write enabled)' : '',
					sw ? '(schema_write enabled)' : '',
				);
				if (snippetId) {
					const del = await wpFetch(
						baseUrl,
						auth,
						`/code-snippets/v1/snippets/${snippetId}`,
						{ method: 'DELETE' },
					);
					console.log('Removed snippet:', del.res.status);
				}
				await prisma.$disconnect();
				return;
			}
		}
	}

	console.error('Upgrade did not confirm within retries. Snippet may still be active.');
	if (snippetId) {
		console.log(`Remove manually: DELETE /code-snippets/v1/snippets/${snippetId}`);
	}
	await prisma.$disconnect();
	process.exit(1);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
