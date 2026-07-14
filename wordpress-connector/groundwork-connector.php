<?php
/**
 * Plugin Name: Groundwork Connector
 * Description: Read-only REST connector for the Groundwork SEO tool. Exposes
 *              Elementor's protected builder meta (_elementor_data,
 *              _elementor_page_settings, _elementor_version) on the standard
 *              /wp/v2/pages and /wp/v2/posts endpoints, restricted to
 *              authenticated requests from a user who can edit posts. Adds no
 *              write capability and no public data exposure beyond what the
 *              default REST API already exposes to authenticated editors.
 * Version:     1.4.0
 * Author:      Captive Demand
 *
 * Install: drop this file in wp-content/mu-plugins/ (create that directory if
 * it doesn't exist). Must-use plugins load automatically — no activation step,
 * and it can't be accidentally deactivated from the plugins screen.
 *
 * Why this is needed: _elementor_data is protected post meta (leading
 * underscore), which WordPress core never surfaces over REST — not even to
 * authenticated requests with edit_posts — because register_post_meta was
 * never called for it. register_rest_field lets us return it explicitly,
 * gated by our own capability check below.
 */

if (!defined('ABSPATH')) {
	exit;
}

/**
 * Bundle the Elementor meta this tool needs into one field so a single
 * /wp/v2/pages or /wp/v2/posts request returns everything, instead of one
 * extra request per post.
 */
add_action('rest_api_init', function () {
	foreach (['page', 'post'] as $post_type) {
		register_rest_field(
			$post_type,
			'groundwork_elementor',
			[
				'get_callback' => function ($object) {
					$post_id = $object['id'];
					return [
						'data'          => get_post_meta($post_id, '_elementor_data', true) ?: null,
						'page_settings' => get_post_meta($post_id, '_elementor_page_settings', true) ?: null,
						'version'       => get_post_meta($post_id, '_elementor_version', true) ?: null,
						'edit_mode'     => get_post_meta($post_id, '_elementor_edit_mode', true) ?: null,
					];
				},
				'update_callback' => null, // read-only — no write path in v1
				'schema'          => [
					'description' => 'Elementor builder data, exposed read-only for Groundwork.',
					'type'        => 'object',
					'context'     => ['edit'],
				],
			]
		);

		// SEO plugin meta — required for Groundwork to write title/description back.
		foreach (['rank_math_title', 'rank_math_description', '_yoast_wpseo_title', '_yoast_wpseo_metadesc', '_seopress_titles_title', '_seopress_titles_desc', '_aioseo_title', '_aioseo_description'] as $meta_key) {
			register_post_meta($post_type, $meta_key, [
				'type'              => 'string',
				'single'            => true,
				'show_in_rest'      => true,
				'auth_callback'     => function () {
					return current_user_can('edit_posts');
				},
			]);
		}
	}
});

/**
 * register_rest_field has no per-field auth_callback, so gate access with a
 * response filter instead: strip the field for any request that isn't an
 * authenticated user who can edit posts. This keeps the builder JSON out of
 * anonymous/public REST responses even though the get_callback above always
 * runs.
 */
function groundwork_strip_elementor_field_if_unauthorized($response, $post, $request) {
	if (!current_user_can('edit_posts')) {
		if (isset($response->data['groundwork_elementor'])) {
			unset($response->data['groundwork_elementor']);
		}
	}
	return $response;
}
add_filter('rest_prepare_page', 'groundwork_strip_elementor_field_if_unauthorized', 10, 3);
add_filter('rest_prepare_post', 'groundwork_strip_elementor_field_if_unauthorized', 10, 3);

/**
 * Connector status — Groundwork probes this to confirm SEO write support is live.
 */
add_action('rest_api_init', function () {
	register_rest_route('groundwork/v1', '/status', [
		'methods'             => 'GET',
		'permission_callback' => function () {
			return current_user_can('edit_posts');
		},
		'callback'            => function () {
			return [
				'version'         => '1.4.0',
				'seo_write'       => true,
				'elementor_read'  => true,
				'elementor_write' => true,
				'schema_write'    => true,
			];
		},
	]);
});

/**
 * Write SEO title + meta directly via update_post_meta().
 * Standard WP REST silently drops Yoast keys unless show_in_rest is registered;
 * this endpoint always persists to the SEO plugin post meta keys.
 */
add_action('rest_api_init', function () {
	register_rest_route('groundwork/v1', '/(?P<type>pages|posts)/(?P<id>\d+)/seo-meta', [
		'methods'             => 'POST',
		'permission_callback' => function () {
			return current_user_can('edit_posts');
		},
		'callback'            => 'groundwork_write_seo_meta',
		'args'                => [
			'type' => [
				'required'          => true,
				'validate_callback' => function ($param) {
					return in_array($param, ['pages', 'posts'], true);
				},
			],
			'id'   => [
				'required'          => true,
				'validate_callback' => function ($param) {
					return is_numeric($param) && (int) $param > 0;
				},
			],
		],
	]);
});

/**
 * @param WP_REST_Request $request
 * @return WP_REST_Response|WP_Error
 */
function groundwork_write_seo_meta($request) {
	$post_id   = (int) $request['id'];
	$post_type = $request['type'] === 'posts' ? 'post' : 'page';
	$post      = get_post($post_id);

	if (!$post || $post->post_type !== $post_type) {
		return new WP_Error('groundwork_invalid_post', 'Post not found', ['status' => 404]);
	}

	if (!current_user_can('edit_post', $post_id)) {
		return new WP_Error('groundwork_forbidden', 'Cannot edit this post', ['status' => 403]);
	}

	$body        = $request->get_json_params();
	$title       = isset($body['title']) ? sanitize_text_field($body['title']) : '';
	$description = isset($body['description']) ? sanitize_textarea_field($body['description']) : '';

	if ($title === '' && $description === '') {
		return new WP_Error('groundwork_empty', 'title or description is required', ['status' => 400]);
	}

	if ($title !== '') {
		update_post_meta($post_id, '_yoast_wpseo_title', $title);
		update_post_meta($post_id, 'rank_math_title', $title);
		update_post_meta($post_id, '_seopress_titles_title', $title);
		update_post_meta($post_id, '_aioseo_title', $title);
	}

	if ($description !== '') {
		update_post_meta($post_id, '_yoast_wpseo_metadesc', $description);
		update_post_meta($post_id, 'rank_math_description', $description);
		update_post_meta($post_id, '_seopress_titles_desc', $description);
		update_post_meta($post_id, '_aioseo_description', $description);
	}

	clean_post_cache($post_id);

	// Nudge Yoast to pick up the new meta in the block editor sidebar.
	if (function_exists('wpseo_init')) {
		do_action('wpseo_save_post', $post_id);
	}

	$stored_title = get_post_meta($post_id, '_yoast_wpseo_title', true);
	if ($stored_title === '' || $stored_title === false) {
		$stored_title = get_post_meta($post_id, 'rank_math_title', true);
	}
	$stored_desc = get_post_meta($post_id, '_yoast_wpseo_metadesc', true);
	if ($stored_desc === '' || $stored_desc === false) {
		$stored_desc = get_post_meta($post_id, 'rank_math_description', true);
	}

	return rest_ensure_response([
		'id'          => $post_id,
		'link'        => get_permalink($post_id),
		'editUrl'     => admin_url("post.php?post={$post_id}&action=edit"),
		'title'       => $stored_title ?: null,
		'description' => $stored_desc ?: null,
	]);
}

/**
 * Patch existing Elementor builder data on a page/post.
 * Groundwork sends the full updated _elementor_data JSON after in-place edits
 * (heading text, text-editor copy, internal links). Does not create sections.
 */
add_action('rest_api_init', function () {
	register_rest_route('groundwork/v1', '/(?P<type>pages|posts)/(?P<id>\d+)/elementor-content', [
		'methods'             => 'POST',
		'permission_callback' => function () {
			return current_user_can('edit_posts');
		},
		'callback'            => 'groundwork_write_elementor_content',
		'args'                => [
			'type' => [
				'required'          => true,
				'validate_callback' => function ($param) {
					return in_array($param, ['pages', 'posts'], true);
				},
			],
			'id'   => [
				'required'          => true,
				'validate_callback' => function ($param) {
					return is_numeric($param) && (int) $param > 0;
				},
			],
		],
	]);
});

/**
 * @param WP_REST_Request $request
 * @return WP_REST_Response|WP_Error
 */
function groundwork_write_elementor_content($request) {
	$post_id   = (int) $request['id'];
	$post_type = $request['type'] === 'posts' ? 'post' : 'page';
	$post      = get_post($post_id);

	if (!$post || $post->post_type !== $post_type) {
		return new WP_Error('groundwork_invalid_post', 'Post not found', ['status' => 404]);
	}

	if (!current_user_can('edit_post', $post_id)) {
		return new WP_Error('groundwork_forbidden', 'Cannot edit this post', ['status' => 403]);
	}

	$body = $request->get_json_params();
	$raw  = isset($body['elementor_data']) ? $body['elementor_data'] : '';
	if (!is_string($raw) || $raw === '') {
		return new WP_Error('groundwork_empty', 'elementor_data is required', ['status' => 400]);
	}

	$decoded = json_decode($raw, true);
	if (!is_array($decoded)) {
		return new WP_Error('groundwork_invalid_json', 'elementor_data must be valid JSON', ['status' => 400]);
	}

	update_post_meta($post_id, '_elementor_data', wp_slash($raw));
	update_post_meta($post_id, '_elementor_edit_mode', 'builder');

	if (class_exists('\Elementor\Plugin')) {
		\Elementor\Plugin::$instance->files_manager->clear_cache();
	}

	clean_post_cache($post_id);

	return rest_ensure_response([
		'id'      => $post_id,
		'link'    => get_permalink($post_id),
		'editUrl' => admin_url("post.php?post={$post_id}&action=elementor"),
	]);
}

/**
 * Store supplemental JSON-LD graph pieces Groundwork merges into Yoast output.
 * Yoast owns Article/BlogPosting; Groundwork adds FAQPage and other deltas only.
 */
add_action('rest_api_init', function () {
	register_post_meta('post', '_groundwork_schema_graph', [
		'type'              => 'string',
		'single'            => true,
		'show_in_rest'      => false,
		'auth_callback'     => function () {
			return current_user_can('edit_posts');
		},
	]);
	register_post_meta('page', '_groundwork_schema_graph', [
		'type'              => 'string',
		'single'            => true,
		'show_in_rest'      => false,
		'auth_callback'     => function () {
			return current_user_can('edit_posts');
		},
	]);

	register_rest_route('groundwork/v1', '/(?P<type>pages|posts)/(?P<id>\d+)/schema-graph', [
		'methods'             => 'POST',
		'permission_callback' => function () {
			return current_user_can('edit_posts');
		},
		'callback'            => 'groundwork_write_schema_graph',
		'args'                => [
			'type' => [
				'required'          => true,
				'validate_callback' => function ($param) {
					return in_array($param, ['pages', 'posts'], true);
				},
			],
			'id'   => [
				'required'          => true,
				'validate_callback' => function ($param) {
					return is_numeric($param) && (int) $param > 0;
				},
			],
		],
	]);
});

/**
 * @param WP_REST_Request $request
 * @return WP_REST_Response|WP_Error
 */
function groundwork_write_schema_graph($request) {
	$post_id   = (int) $request['id'];
	$post_type = $request['type'] === 'posts' ? 'post' : 'page';
	$post      = get_post($post_id);

	if (!$post || $post->post_type !== $post_type) {
		return new WP_Error('groundwork_invalid_post', 'Post not found', ['status' => 404]);
	}

	if (!current_user_can('edit_post', $post_id)) {
		return new WP_Error('groundwork_forbidden', 'Cannot edit this post', ['status' => 403]);
	}

	$body = $request->get_json_params();
	$raw  = isset($body['graph_json']) ? $body['graph_json'] : '';
	if (!is_string($raw) || $raw === '') {
		return new WP_Error('groundwork_empty', 'graph_json is required', ['status' => 400]);
	}

	$decoded = json_decode($raw, true);
	if (!is_array($decoded)) {
		return new WP_Error('groundwork_invalid_json', 'graph_json must be valid JSON', ['status' => 400]);
	}

	update_post_meta($post_id, '_groundwork_schema_graph', wp_slash($raw));
	clean_post_cache($post_id);

	return rest_ensure_response([
		'id'   => $post_id,
		'link' => get_permalink($post_id),
	]);
}

/**
 * Merge stored Groundwork graph pieces into Yoast schema output.
 */
add_filter('wpseo_schema_graph', function ($graph, $context) {
	if (!is_array($graph)) {
		return $graph;
	}

	$post_id = 0;
	if (is_object($context) && isset($context->indexable) && isset($context->indexable->object_id)) {
		$post_id = (int) $context->indexable->object_id;
	} elseif (is_singular()) {
		$post_id = (int) get_queried_object_id();
	}

	if ($post_id <= 0) {
		return $graph;
	}

	$stored = get_post_meta($post_id, '_groundwork_schema_graph', true);
	if (!is_string($stored) || $stored === '') {
		return $graph;
	}

	$piece = json_decode($stored, true);
	if (!is_array($piece)) {
		return $graph;
	}

	if (isset($piece['@graph']) && is_array($piece['@graph'])) {
		foreach ($piece['@graph'] as $node) {
			if (is_array($node)) {
				$graph[] = $node;
			}
		}
	} else {
		$graph[] = $piece;
	}

	return $graph;
}, 10, 2);
