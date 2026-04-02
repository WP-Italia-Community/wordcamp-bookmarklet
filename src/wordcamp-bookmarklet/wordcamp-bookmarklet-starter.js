javascript:(
	/**
	 * WordCamp utils bookmarklet.
	 *
	 * @param {object}   window - `window` object.
	 * @param {object}   document - `document` object.
	 * @param {string}   tagname - `script` tagname.
	 * @param {string}   script_source - JavaScript url. Loaded if `hook` call fails.
	 * @param {string}   id - `script` attribute `id` value.
	 * @param {function} hook - Function to execute.
	 * @param {string}   code - Code to `eval`uate.
	 *
	 * @return void
	 */
	function( window, document, tagname, script_source, id, hook, code ) {
		if ( typeof( hook ) !== 'function' ) {
			hook = function () {
				eval( code );
			};
		}
		try {
			hook();
		}
		catch ( err ) {

			// Check for JS source.
			if ( script_source !== undefined ) {

				var document_script_append_node = document.getElementsByTagName(tagname)[0],
					timestamp = '?_t=' + +(new Date());

				// Create script node for JS.
				var script_node = document.createElement(tagname);
				script_node.async = 1;
				script_node.id = id + '-js';
				script_node.onload = hook;
				script_node.src = script_source + timestamp;

				if ( typeof jQuery === 'undefined' ) {
					var jq_script_node = document.createElement(tagname);
					jq_script_node.async = 1;
					jq_script_node.id = id + '-jq';
					jq_script_node.onload = function() {
						// Add script node to DOM.
						document_script_append_node.parentNode.insertBefore(script_node, document_script_append_node);
					};
					jq_script_node.src = '//code.jquery.com/jquery-4.0.0.min.js';

					// Add script node to DOM.
					document_script_append_node.parentNode.insertBefore(jq_script_node, document_script_append_node);
				}
				else {
					// Add script node to DOM.
					document_script_append_node.parentNode.insertBefore(script_node, document_script_append_node);
				}
			}
		}
	}
)
(
	window,
	document,
	'script',
	'https://cdn.jsdelivr.net/gh/WP-Italia-Community/wordcamp-bookmarklet@main/dist/wordcamp-bookmarklet/WordCamp.Bookmarklet.min.js',
	'wordcamp-bookmarklet',
	function() { wcb = new WordCamp.Bookmarklet() }
);


