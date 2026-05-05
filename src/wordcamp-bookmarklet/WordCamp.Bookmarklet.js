// Make all in a closure.
;(function ($) {

window.WordCamp = window.WordCamp || {};
WordCamp.Bookmarklet = class {

	// Version.
	static #VERSION = '1.2.2';
	static get VERSION() {
		return this.#VERSION;
    }

	#currentOverlay;

	#default_conf = {
		start_date: '2026/05/08',
		end_date: '2026/05/09',
		coupon_regex: {
			sponsor: '^SPNS-([^-]*).*', // $1 must contain sponsor name.
			speaker: '^SPKS',
			organizer: '^ORGA',
			volunteer: '^VLNS'
		}
	};

	#wordcamp_uri = ajaxurl.replace(/^(.*\/)wp-admin\/.*/, '$1');

	/**
	 * Class constructor.
	 * @param args
	 */
	constructor( args ) {

		this.args = $.extend(
			true,
			{
				debug: false,
				container: undefined,
				trigger: undefined,
				position: 'append',
				modalTitle: 'Info',
				description: '',
				closeButtonText: 'Close',
				buttonText: 'Options',
				elementClass: '',
				elementId: '',
			},
			args
		);

		// Does nothing. Check for init
		if ( $( '#wordcamp-bookmarklet' ).length > 0) {
			return;
		}

		// Get settings.
		this.getSettings();

		// Table.
		this._tables = {
			attendees: [],
			tickets: []
		};

		// Close modal on ESC keyb.
		this.handleEsc = (e) => {
			if ( 'Escape' === e.key && this.#currentOverlay ) {
				this.closeModal();
			}
		};

		// Check for min version (for local development).
		const js_node_href = $( '#wordcamp-bookmarklet-js' ).attr( 'src' );
		const min = /min/.test( js_node_href ) ? '.min': '';
		const timestamp = '?_t=' + +(new Date());

		// Load dependecies assets synchronously.
		this.addStaticAssets(
			[
				{
					href: js_node_href.replace( /[^\/]+$/, '' ) + 'wordcamp-bookmarklet' + min + '.css' + timestamp,
					rel: 'stylesheet'
				},
				{
					href: 'https://i5.plug.it/iplug/js/lib/std/jquery.json-viewer/json-viewer-white.css',
					rel: 'stylesheet'
				},
				{
					src: 'https://i5.plug.it/iplug/js/lib/std/jquery.json-viewer/jquery.json-editor.min.js',
					type: 'text/javascript'
				},
				{
					src: 'https://cdn.jsdelivr.net/npm/alasql@4',
					type: 'text/javascript'
				},
				{
					src: 'https://cdn.jsdelivr.net/npm/chart.js',
					type: 'text/javascript'
				},
				{
					src: 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
					type: 'text/javascript'
				},
				{
					src: 'https://cdn.jsdelivr.net/gh/enrico-sorcinelli/local-storage-cache@main/dist/local-storage-cache.min.js',
					type: 'text/javascript'
				}
			])
			.then( () => {
				console.info( 'All assets loaded!' );
				this.addMenuBarItem();
				setTimeout( function () { $( '#wordcamp-bookmarklet .tickets' ).trigger( 'click' ) }, 500 );
			})
			.catch( err => console.error( 'Asset loading error:', err ) );
	}

	/**
	 * Open modal.
	 *
	 * @param args
	 */
	openModal( args ) {

		args = $.extend(
			true,
			{
				debug: false,
				container: undefined,
				trigger: undefined,
				position: 'append',
				title: 'Info',
				description: '',
				closeButtonText: 'Close',
				elementId: '',
			},
			args
		);

		if ( this.#currentOverlay ) {
			return;
		}

		const $overlay = $('<div>').addClass( 'wordcamp-bookmarklet-modal-overlay' );
		const $modal = $('<div>').addClass( 'wordcamp-bookmarklet-modal-content ' + this.args.elementClass.trim() );
		const $title = $('<h3>').addClass( 'wordcamp-bookmarklet-modal-title' ).text( args.title );
		const $description = $('<div>').addClass( 'wordcamp-bookmarklet-modal-description' ).html( args.description );
		const $content = $('<div>').addClass( 'wordcamp-bookmarklet-modal-body' ).html( args.content );

		const $closeBtn = $('<button>')
			.addClass('wordcamp-bookmarklet-modal-close-btn button')
			.text(this.args.closeButtonText)
			.on('click', () => this.closeModal());

		$modal.append( $title, $description, $content, $closeBtn );
		$overlay.append( $modal ).appendTo( 'body' );

		// Close clicking on overlay.
		$overlay.on('click', (e) => {
			if ($(e.target).is($overlay)) this.closeModal();
		});

		this.#currentOverlay = $overlay;
		$(document).on( 'keydown', this.handleEsc );
	}

	/**
	 * Close modal.
	 */
	closeModal() {
		if ( this.#currentOverlay ) {
			this.#currentOverlay.remove();
			this.#currentOverlay = null;
			$( document ).off( 'keydown', this.handleEsc );
		}
	}

	/**
	 * Get stats from attendees list.
	 *
	 * @param {Boolean} [force_update?false] - Force update/rebuild data.
	 */
	getAttendees( force_update = false ) {

		// Resets data.
		if ( true === force_update ) {
			this._tables = {
				attendees: [],
				tickets: []
			};
		}

		if ( this._tables.attendees.length > 0 ) {
			return;
		}

		this.stats = {
			tickets: {}
		};

		const self = this;

		$('.wp-list-table tbody tr').each( function() {

			// Create attendee row.
			let attendee = {
				id: parseInt( $( this ).attr( 'id' ).replace( /^post-/, '' ) ),
				name: $( this ).find( '.row-title' ).text().replace(/^(.)/, ( match ) => match.toUpperCase() ),
				post_state: $( this ).find( '.post-state' ).text(),
				ticket: $( this ).find( '.tix_ticket' ).text(),
				ticket_price: parseInt( $( this ).find( '.tix_ticket_price' ).text().replace( /[^\d.]/g, '' ) ),
				coupon: $( this ).find( '.tix_coupon' ).text(),
				reservation: $( this ).find( '.tix_reservation' ).text(),
				date: self.getDate( $( this ).find( '.date' ).text() ),
				is_sponsor: self.coupon_regex.sponsor.test( $( this ).find( '.tix_coupon' ).text() ),
				is_speaker: self.coupon_regex.speaker.test( $( this ).find( '.tix_coupon' ).text() ),
				is_organizer: self.coupon_regex.organizer.test( $( this ).find( '.tix_coupon' ).text() ),
				is_volunteer: self.coupon_regex.volunteer.test( $( this ).find( '.tix_coupon' ).text() )
			};
			attendee.is_unknown_coupon = attendee.coupon && ! ( attendee.is_sponsor || attendee.is_speaker || attendee.is_organizer || attendee.is_volunteer );
			attendee.sponsor_name = self.coupon_regex.sponsor.test( attendee.coupon ) ? RegExp.$1.toLowerCase().replace(/^(.)/, ( match ) => match.toUpperCase() ) : '';
			self._tables.attendees.push( attendee );
		});

		// Drop anyway.
		alasql( 'DROP TABLE IF EXISTS attendees' );

		// Create table.
		alasql( 'CREATE TABLE attendees ( id NUMBER, coupon STRING, date STRING, is_attendee BOOLEAN, is_organizer BOOLEAN, is_speaker BOOLEAN, is_sponsor BOOLEAN, is_unknown_coupon BOOLEAN, is_volunteer BOOLEAN, name STRING, post_state STRING, reservation STRING, sponsor_name STRING, ticket STRING, ticket_price NUMBER )' )

		// Bulk load.
		alasql.tables.attendees.data = this._tables.attendees;

		// Update is_* for all tickets.
		[ 'organizer', 'sponsor', 'speaker', 'volunteer' ].forEach( function ( role ) {
			const persons = alasql( 'SELECT name FROM attendees WHERE is_' + role + ' = ?', [true] ).map( a => a.name );
			alasql( 'UPDATE attendees SET is_' + role + ' = ? WHERE name IN(' + persons.map(() => '?').join(', ') + ')', [ true ].concat( persons ) );
		});

		// Set is_attendee flag.
		alasql( 'UPDATE attendees SET is_attendee = ? WHERE NOT (is_speaker = ? OR is_organizer = ? OR is_volunteer = ? OR is_sponsor = ? OR is_unknown_coupon = ?)', [ true, true,true, true, true, true] );

		// Update sponsor_name for all sponsor attendee tickets.
		alasql( 'SELECT DISTINCT name, sponsor_name FROM attendees WHERE is_sponsor = true AND sponsor_name != ""' ).forEach( function(row) {
			alasql( 'UPDATE attendees SET sponsor_name = ? WHERE name = ? AND is_sponsor = ? AND ( sponsor_name = "" OR sponsor_name IS NULL )', [ row.sponsor_name, row.name, true ] );
		});

		// All people (all days).
		this.stats.people = alasql( 'SELECT DISTINCT name FROM attendees WHERE post_state = "" ORDER BY name' ).map( a => a.name ).sort();

		// Get all tickets (counting purchaded one).
		this._tables.tickets = alasql( 'SELECT ticket, ticket_price, COUNT(*) AS purchased FROM attendees WHERE post_state = "" GROUP BY ticket, ticket_price ORDER BY ticket' );

		// Add stats for each ticket.
		this._tables.tickets.forEach( function( el ) {

			self.stats.tickets[ el.ticket ] = {
				attendees: alasql('SELECT name FROM attendees WHERE post_state = "" AND ticket = ? AND is_attendee = ? ORDER BY name', [ el.ticket, true ] ).map( a => a.name ).sort(),
				organizers: alasql('SELECT name FROM attendees WHERE post_state = "" AND ticket = ? AND is_organizer = ? ORDER BY name', [ el.ticket, true ] ).map( a => a.name ).sort(),
				speakers: alasql('SELECT name FROM attendees WHERE post_state = "" AND ticket = ? AND is_speaker = ? ORDER BY name', [ el.ticket, true ] ).map( a => a.name ).sort(),
				// sponsors: alasql('SELECT name FROM attendees WHERE post_state = "" AND ticket = ? AND is_sponsor = ? ORDER BY coupon', [ el.ticket, true ] ).map( a => a.name ).sort(),
				volunteers: alasql('SELECT name FROM attendees WHERE post_state = "" AND ticket = ? AND is_volunteer = ? ORDER BY name', [ el.ticket, true ] ).map( a => a.name ).sort(),
				unknown_coupon: alasql('SELECT name FROM attendees WHERE post_state = "" AND ticket = ? AND is_unknown_coupon = ? ORDER BY name', [ el.ticket, true ] ).map( a => a.name ).sort(),
				_post_state: alasql('SELECT name, post_state FROM attendees WHERE post_state != "" AND ticket = ? ORDER BY name' )
			};

			const sponsors_details = alasql('SELECT name, sponsor_name, coupon FROM attendees where post_state = "" AND ticket = ? AND is_sponsor = ? ORDER BY sponsor_name, name', [ el.ticket, true ] );
			self.stats.tickets[ el.ticket ].sponsors = { _total: 0 };
			sponsors_details.forEach( function( sponsor ) {
				if ( typeof self.stats.tickets[ el.ticket ].sponsors[ sponsor.sponsor_name ] === 'undefined' ) {
					self.stats.tickets[ el.ticket ].sponsors[ sponsor.sponsor_name ] = {}
				}
				self.stats.tickets[ el.ticket ].sponsors[ sponsor.sponsor_name ][ sponsor.name ] = sponsor.coupon;//.replace( self.coupon_regex.sponsor, '$1' );
				self.stats.tickets[ el.ticket ].sponsors._total++;
			});
		});
	}

	/**
	 * Helper method to get compete CSV tickets file.
	 *
	 * @return {Promise}
	 */
	getTickets() {
		let def = $.Deferred();
		$.ajax(
			this.#wordcamp_uri + 'wp-admin/edit.php?post_type=tix_ticket&page=camptix_tools&tix_section=export',
			{
				async: false
			}
		).done( ( response ) => {
			var wpnonce = $( response ).find( '#_wpnonce' ).val();
			$.ajax(
				this.#wordcamp_uri + 'wp-admin/edit.php?post_type=tix_ticket&page=camptix_tools&tix_section=export&tix_export=1',
				{
					method: 'post',
					data: {
						post_type: 'tix_ticket',
						page: 'camptix_tools',
						tix_section: 'export',
						tix_export: 1,
						tix_export_to: 'csv',
						_wpnonce: wpnonce,
						tix_export_submit: 1
					}
				}
			).done( function ( response ) {
				const csv_data = Papa.parse( response, {
					header: true,
					dynamicTyping: true
				});
				def.resolve( csv_data );
			});
		});

		return def.promise();
	}

	/**
	 * Add item in admin bar.
 	 */
	addMenuBarItem() {
		$( '#wpadminbar #wp-admin-bar-root-default').append( '<li role=group id="wordcamp-bookmarklet"><a class="ab-item tickets" role="menuitem" href="#"><span class="ab-icon wp-menu-image dashicons-before dashicons-tickets" aria-hidden="true"></span></a></li>' );

		// Handle click.
		$( '#wordcamp-bookmarklet .tickets' ).on(
			'click',
			( e ) => {
				e.preventDefault();
				e.stopPropagation();

				if ( typeof pagenow === undefined || 'edit-tix_attendee' !== pagenow ) {
					return;
				}

				// Compute stats.
				this.getAttendees();

				this.openModal( {
					title: 'Tickets info',
						content: `
<h2 class="nav-tab-wrapper wordcamp-bookmarklet">
	<a class="nav-tab nav-tab-active wordcamp-bookmarklet">Summary</a>
	<a class="nav-tab wordcamp-bookmarklet">Charts</a>
	<a class="nav-tab wordcamp-bookmarklet">JSON Data viewer</a>
	<a class="nav-tab wordcamp-bookmarklet">Settings</a>
	<a class="nav-tab wordcamp-bookmarklet">Credits</a>
</h2>
<section class="wordcamp-bookmarklet">
	<div class="summary"></div>
</section>
<section class="wordcamp-bookmarklet">
	<div class="wordcamp-bookmarklet-tickets-container">
		<canvas id="wordcamp-bookmarklet-tickets-chart"></canvas>
	</div>
</section>
<section class="wordcamp-bookmarklet">
	<pre class="json-viewer"/>
</section>
<section class="wordcamp-bookmarklet settings">
	<p>
		The bookmarklet is tuned for WordCamp Torino 2026, but the following settings may allow it to work correctly for other WordCamps as well.	
	</p>
	<table class="form-table" role="presentation">
	    <tbody>
	        <tr>
	            <th scope="row"><label for="wordcamp-bookmarklet-start-date">Start date</label></th>
	            <td><input type="text" id="wordcamp-bookmarklet-start-date" value="${ _.escape( this.conf.start_date ) }" class="regular-text"></td>
	        </tr>
   	        <tr>
	            <th scope="row"><label for="wordcamp-bookmarklet-end-date">End date</label></th>
	            <td><input type="text" id="wordcamp-bookmarklet-end-date" value="${ _.escape( this.conf.end_date ) }" class="regular-text"></td>
	        </tr>
	        <tr>
	            <th scope="row">Coupon regex</th>
	            <td>
	                <p>
	                    Even if Coupons code can be all different, if  yours have something in common, this can be used to group the different types of participants in he summary.
	                </p>
	                <p>
	                    <span class="coupon-regex">Organizers</span><input type="text" id="wordcamp-bookmarklet-coupon-organizer" value="${ _.escape( this.conf.coupon_regex.organizer ) }" class="regular-text validate-regex">
	                </p>
	                <p>
	                    <span class="coupon-regex">Speakers</span><input type="text" id="wordcamp-bookmarklet-coupon-speaker" value="${ _.escape( this.conf.coupon_regex.speaker ) }" class="regular-text validate-regex">
	                </p>
	                <p>
	                    <span class="coupon-regex">Sponsors</span><input type="text" id="wordcamp-bookmarklet-coupon-sponsor" value="${ _.escape( this.conf.coupon_regex.sponsor ) }" class="regular-text validate-regex">
	                    <br>
	                    <span class="description">Captured Group 1 should contain sponsor name.</span>
	                </p>
	                <p>
	                    <span class="coupon-regex">Volunteers</span><input type="text" id="wordcamp-bookmarklet-coupon-volunteer" value="${ _.escape( this.conf.coupon_regex.volunteer ) }" class="regular-text validate-regex">
	                </p>
	            </td>
	        </tr>
	    </tbody>
	</table>
	<p class="submit">
	<input type="submit" id="wordcamp-bookmarklet-save-settings" class="button button-primary" value="Save settings">
	<input type="submit" id="wordcamp-bookmarklet-restore-settings" class="button" value="Restore default settings">
	</p>
</section>
<section class="wordcamp-bookmarklet">
	<div class="credits">
	<div>
		This bookmarklet uses data from the ticket attendees page to aggregate some information on sales trends and was created as a POC to evaluate the usefulness of integrating it into the backoffice.
	</div>
	<p>2026 - WordPress Italia Community & Enrico Sorcinelli - <a href="https://github.com/WP-Italia-Community/wordcamp-bookmarklet" target="_blank">https://github.com/WP-Italia-Community/wordcamp-bookmarklet</a></p>
	</div>
</section>
` } );

				// Update summary.
				this.createSummary( true );

				// Update charts.
				this.createTicketChars();

				// Updata JSON data viewer.
				this.updateJsonViewer();

				// Tab managements.
				$( '.nav-tab-wrapper.wordcamp-bookmarklet a' ).on( 'click', function () {
					$( '.nav-tab' ).removeClass( 'nav-tab-active' );
					$( this ).addClass( 'nav-tab-active' );
					$( 'section.wordcamp-bookmarklet' )
						.hide()
						.eq( $( this ).index() ).show();
					return false;
				} );

				// Handle save settings button.
				$( '#wordcamp-bookmarklet-save-settings' ).on(
					'click',
					( e ) => {
						e.preventDefault();
						e.stopPropagation();
						this.saveSettings();
					}
				);

				// Handle restore settings button.
				$( '#wordcamp-bookmarklet-restore-settings' ).on(
					'click',
					( e ) => {
						e.preventDefault();
						e.stopPropagation();
						this.restoreDefaultSettings();
					}
				);

				// Handle regex validation
				$( '.wordcamp-bookmarklet.settings .validate-regex' ).on(
					'keyup keydown',
					this.validateRegexField.bind( this )
				);

				// Init regex validation.
				$( '.wordcamp-bookmarklet.settings .validate-regex' ).trigger( 'keydown' );
			}
		);
	}

	/**
	 * Get date from column.
	 */
	getDate( string ) {
		let date = string.replace( /^\s*([^\d]*)\s*((\d+)\/(\d+)\/(\d+)).*/i, '$2' );
		// Italian date format and similar.
		if ( RegExp.$3.length < 4 ) {
			date = RegExp.$5 + '/' + RegExp.$4 + '/' + RegExp.$3;
		}
		return date;
	}

	/**
	 * Update JSON data viewer.
	 */
	updateJsonViewer() {
		let $json_viewer = $( '.wordcamp-bookmarklet-modal-body .json-viewer' );
		if ( typeof $json_viewer.data( 'json-viewer' ) === 'undefined' ) {
			$json_viewer.data( 'json-viewer', new JsonEditor( '.wordcamp-bookmarklet-modal-body .json-viewer', undefined, { editable: false, collapsed: true } ) );
		}
		$json_viewer.data( 'json-viewer' ).load( this.stats );
	}

	/**
	 * Create summary
	 *
	 * @param {Boolean} [update=false]
	 *
	 * @return {string}
	 */
	createSummary( update = false ) {
		let summary = '';
		this._tables.tickets.forEach( el => {
			summary += `<h2>${ el.ticket }</h2><h4>${ el.purchased } tickets</h4>`;

			for ( const [key, value] of Object.entries( this.stats.tickets[ el.ticket ] ) ) {
				if ( /^_/.test( key ) ) {
					continue;
				}
				summary += `<div><span class="label">${key}</span>: <span class="value">${ 'sponsors' === key ? value._total : value.length}</span></div>`;
			}
		});

		if ( update ) {
			$( '.wordcamp-bookmarklet .summary' ).html( summary );
		}
		return summary;
	}

	/**
	 * Create charts.
	 */
	createTicketChars() {

		const $canvas = $('#wordcamp-bookmarklet-tickets-chart' );

		// Last ticket.
		let last_ticket = alasql( 'SELECT date FROM attendees WHERE post_state = "" ORDER BY id DESC LIMIT 1' );

		// Get sold tickets (any type).
		let total_tickets_sold = alasql( 'SELECT date, COUNT(*) AS c FROM attendees WHERE post_state = "" AND coupon = "" AND ticket_price > 0 GROUP BY date ORDER BY date asc' );

		// Complete days range.
		const x_axis = this.generateDateRange( total_tickets_sold[0].date, last_ticket.length ? last_ticket[0].date : undefined );
		const dataset = [
			{
				label: 'Total sold tickets',
				data: this.fillChartDataRange({
					data_x: x_axis,
					data_y: total_tickets_sold,
					key_label: 'date',
					value_label: 'c',
					incremental: true,
				}),
				borderColor: '#36A2EB',
				backgroundColor: 'rgba(54, 162, 235, 0.2)',
				fill: true, // Crea un'area colorata sotto la linea
				tension: 0.3 // Rende la linea leggermente curva (smooth)
			},
			{
				label: 'Daily sales',
				data: this.fillChartDataRange({
					data_x: x_axis,
					data_y: total_tickets_sold,
					key_label: 'date',
					value_label: 'c',
					incremental: false,
				}),
				borderColor: '#36A2EB',
				backgroundColor: 'rgba(54, 162, 235, 0.2)',
				fill: true, // Crea un'area colorata sotto la linea
				tension: 0.3 // Rende la linea leggermente curva (smooth)
			},
		];

		Object.values( this._tables.tickets ).map( t => t.ticket ).forEach( ticket => {
			let tickets_sold = alasql( 'SELECT date, COUNT(*) AS c FROM attendees WHERE post_state = "" AND ticket = ? GROUP BY date ORDER BY date asc', [ ticket ] );
			dataset.push(
				{
					label: ticket,
					data: this.fillChartDataRange({
						data_x: x_axis,
						data_y: tickets_sold,
						key_label: 'date',
						value_label: 'c',
						incremental: true,
					}),
					borderColor: '#36A2EB',
					backgroundColor: 'rgba(54, 162, 235, 0.2)',
					fill: true, // Crea un'area colorata sotto la linea
					tension: 0.3, // Rende la linea leggermente curva (smooth)
					hidden: true
				}
			)
		});

		// Destroy if needed.
		if ( $canvas.data( 'chart' ) ) {
			$canvas.data( 'chart' ).destroy();
        }

	    $canvas.data(
			'chart',
			new Chart(
				document.getElementById( 'wordcamp-bookmarklet-tickets-chart' ).getContext( '2d' ),
				{
		            type: 'line',
					data: {
						labels: x_axis.map( t => t.replace( /^\d+\//, '' ) ), // Asse X
						datasets: dataset
					},
					options: {
						responsive: true,
						maintainAspectRatio: false,
						scales: {
							y: {
								beginAtZero: true,
								title: { display: true, text: 'Sold' }
							},
							x: {
								title: { display: true, text: 'Day' }
							}
						}
					}
				}
			)
	    );
	}

	/**
	 * Generate date range array.
	 *
	 * @param {String} start
	 * @param {String }end
	 *
	 * @return {[]}
	 */
	generateDateRange( start, end ) {
		const dates = [];
		let current = new Date( start );
		const today = end ? new Date( end ) : new Date();

		current.setHours(0, 0, 0, 0);
		today.setHours(0, 0, 0, 0);

		while ( current <= today ) {
			const yyyy = current.getFullYear();
			const mm = String(current.getMonth() + 1).padStart(2, '0');
			const dd = String(current.getDate()).padStart(2, '0');
			dates.push(`${yyyy}/${mm}/${dd}`);
			current.setDate( current.getDate() + 1 );
	    }
	    return dates;
	}

	/**
	 * Fill data range.
	 *
	 * @param {Object} args
	 *
	 * @return {Array}
	 */
	fillChartDataRange( args ) {

		args = $.extend(
			true,
			{
				data_x: [],
				data_y: [],
				key_label: undefined,
				value_label: undefined,
				incremental: false
			},
			args
		);

		let total = 0;

		// Map Y rows in a fast lookup map.
		const map = {};
		args.data_y.forEach( item => {
			map[ item[ args.key_label ] ] = item[ args.value_label ];
		});

		// Create final Y-axis
		return args.data_x.map( item => {
			if ( true === args.incremental ) {
				total += map[item] || 0;
				return total;
			}
			else {
				return undefined !== map[item] ? map[item] : 0;
			}
		});
	}

	/**
	 * Get assets.
	 *
	 * @param {Array} assets
	 *
	 * @return {Promise}
	 */
	addStaticAssets( assets = [] ) {

		const promises = assets.map( attrs => {
			return new Promise(( resolve, reject ) => {
				const asset = document.createElement(attrs.rel ? 'link' : 'script' );
				for (const [key, value] of Object.entries( attrs ) ) {
					asset.setAttribute( key, value );
				}
				asset.onload = () => resolve( asset );
				asset.onerror = () => reject( new Error( `Loading error ${ attrs.src || attrs.href }` ) );
				document.head.appendChild( asset );
			});
		});

		return Promise.all( promises );
	}

	/**
	 * Get settings.
	 *
	 * @return {Object}
	 */
	getSettings() {
		const raw_settings = localStorage.getItem( 'wordcamp_bookmarklet_settings' );
		this.conf = raw_settings ? JSON.parse( raw_settings ) : this.#default_conf;
		this.buildCouponRegex();
		return this.conf;
	}

	/**
	 * Save settings on local storage.
	 */
	saveSettings() {
		const settings = {
			start_date: $( '#wordcamp-bookmarklet-start-date').val(),
			end_date: $( '#wordcamp-bookmarklet-end-date').val(),
			coupon_regex: {
				organizer: $( '#wordcamp-bookmarklet-coupon-organizer').val(),
				speaker: $( '#wordcamp-bookmarklet-coupon-speaker').val(),
				sponsor: $( '#wordcamp-bookmarklet-coupon-sponsor').val(),
				volunteer: $( '#wordcamp-bookmarklet-coupon-volunteer').val()
			}
		};
		console.log( 'saved', settings )
		localStorage.setItem( 'wordcamp_bookmarklet_settings', JSON.stringify( settings ) );
		this.getSettings();

		this.buildCouponRegex();

		// Refresh stats
		this.getAttendees( true );

		// Update summary.
		this.createSummary( true );

		// Update charts.
		this.createTicketChars();

		this.updateJsonViewer();
	}

	/**
	 * Restore default settings.
	 */
	restoreDefaultSettings() {
		$( '#wordcamp-bookmarklet-start-date').val( this.#default_conf.start_date );
		$( '#wordcamp-bookmarklet-end-date').val( this.#default_conf.end_date );
		$( '#wordcamp-bookmarklet-coupon-organizer').val( this.#default_conf.coupon_regex.organizer );
		$( '#wordcamp-bookmarklet-coupon-speaker').val( this.#default_conf.coupon_regex.speaker );
		$( '#wordcamp-bookmarklet-coupon-sponsor').val( this.#default_conf.coupon_regex.sponsor );
		$( '#wordcamp-bookmarklet-coupon-volunteer').val( this.#default_conf.coupon_regex.volunteer );

		$( '#wordcamp-bookmarklet-save-settings' ).trigger( 'click' );

	}

	/**
	 * Build coupon regexes.
	 */
	buildCouponRegex() {
		this.coupon_regex = {
			organizer: new RegExp( this.conf.coupon_regex.organizer ),
			speaker: new RegExp( this.conf.coupon_regex.speaker ),
			sponsor: new RegExp( this.conf.coupon_regex.sponsor ),
			volunteer: new RegExp( this.conf.coupon_regex.volunteer )
		};
	}

	/**
	 * Test if current string is a valid regular expression
	 *
	 * @param {Object} args - The argument has following properties.
	 * @param {string|RegExp} args.regex - Regular expression to check.
	 * @param {boolean} [args.debug=false] - Log debug informations.
	 *
	 * @return {boolean|exception} Return `true` if `regex` is a valid regular expression, otherwise `false` or throw an Exception.
	 */
	isValidRegExp( args = {} ) {
		args = $.extend(
			true,
			{
				regex: undefined,
				debug: false,
			},
			args
		);

		if ( typeof( args.regex ) === 'undefined' ) {
			return false;
		}
		// Check for regexp constructor
		if ( args.regex.constructor.name !== 'RegExp' ) {
			// Try to create new regexp
			try {
				args.regex = new RegExp( args.regex );
			}
			catch(e) {
				if ( args.debug ) {
					console.log( e, { prefix: args.logPrefix } );
				}
				return e;
			}
		}
		if ( args.debug ) {
			console.log( args.regex, { prefix: args.logPrefix } );
		}
		return true;
	}

	/**
	 * Validate if fields is current target value contains a valid regular expression.
	 *
	 * @param event
	 */
	validateRegexField( event ) {
		const $container = $( $( event.target ) ).parent();
		const is_valid_regexp = this.isValidRegExp( { regex: $( event.target ).val() } );

		// Bad regexp
		if ( true !== is_valid_regexp ) {
			$container.find('.ok').hide();
			$container.find('.ko').remove();
			$( event.target ).after('<span class="ko"> <span class="dashicons dashicons-warning"></span> ' + is_valid_regexp.name + ': ' + is_valid_regexp.message + '</span>' );
			$( '#wordcamp-bookmarklet-save-settings').prop( 'disabled', true );
		}
		// Regexp OK
		else {
			$container.find('.ko').remove();
			if ( ! $container.find('.ok').length ) {
				$( event.target ).after( '<span class="ok"> <span class="dashicons dashicons-yes-alt"></span> Valid regular expression</span>' );
			}
			else {
				$container.find('.ok').show();
			}
			$( '#wordcamp-bookmarklet-save-settings').prop( 'disabled', false );
		}
	}

	/**
	 * Developer helper util avoiding page reload on code changes.
	 */
	destroy() {
		try {
			$( '#wordcamp-bookmarklet').remove();
			this.closeModal();
			delete window.WordCamp;
			alasql( 'DROP TABLE attendees' );
		}
		catch ( e) {}
	}
};

})( jQuery );
