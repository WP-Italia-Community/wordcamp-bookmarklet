// Make all in a closure
;(function ($) {

window.WordCamp = window.WordCamp || {};
WordCamp.Bookmarklet = class {

	#currentOverlay;

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

		// Doesn't nothiong. Check for init
		if ( $( '#wordcamp-bookmarklet' ).length > 0) {
			return;
		}

		// Init stats.
		this.stats = {};

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
		const min = /min/.test( js_node_href ) ? '.min ': '';
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
	 */
	getAttendees() {

		if ( this._tables.attendees.length > 0 ) {
			return;
		}

		this.stats.tickets = {};
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
				reservation: $( this ).find( '.tix_coupon' ).text(),
				date: self.getDate( $( this ).find( '.date' ).text() ),
				is_sponsor: /^SPNS/.test( $( this ).find( '.tix_coupon' ).text() ),
				is_speaker: /^SPKS/.test( $( this ).find( '.tix_coupon' ).text() ),
				is_orga: /^ORGA/.test( $( this ).find( '.tix_coupon' ).text() ),
				is_volunteer: /^VLNS/.test( $( this ).find( '.tix_coupon' ).text() )
			};
			attendee.is_unknown_coupon = attendee.coupon && ! ( attendee.is_sponsor || attendee.is_speaker || attendee.is_orga || attendee.is_volunteer );
			attendee.sponsor_name = /^SPNS-([^-]*).*/.test( attendee.coupon ) ? RegExp.$1.toLowerCase().replace(/^(.)/, ( match ) => match.toUpperCase() ) : '';
			self._tables.attendees.push( attendee );
		});

		// All people (all days).
		this.stats.people = alasql( 'SELECT DISTINCT name FROM ? WHERE post_state = "" ORDER BY name', [ this._tables.attendees ] ).map( a => a.name ).sort();

		// Get all tickets.
		this._tables.tickets = alasql('SELECT ticket, ticket_price FROM ? WHERE post_state = "" GROUP BY ticket, ticket_prioce ORDER BY ticket', [ this._tables.attendees ] );

		// Add stats for each ticket.
		Object.values( this._tables.tickets ).map( t => t.ticket ).forEach( function( ticket ) {

			self.stats.tickets[ ticket ] = {
				organizers: alasql('SELECT name FROM ? WHERE post_state = "" AND ticket = ? AND is_orga = ? ORDER BY name', [ self._tables.attendees, ticket, true ] ).map( a => a.name ).sort(),
				speakers: alasql('SELECT name FROM ? WHERE post_state = "" AND ticket = ? AND is_speaker = ? ORDER BY name', [ self._tables.attendees, ticket, true ] ).map( a => a.name ).sort(),
				// sponsors: alasql('SELECT name FROM ? WHERE post_state = "" AND ticket = ? AND is_sponsor = ? ORDER BY coupon', [ self._tables.attendees, ticket, true ] ).map( a => a.name ).sort(),
				volunteers: alasql('SELECT name FROM ? WHERE post_state = "" AND ticket = ? AND is_volunteer = ? ORDER BY name', [ self._tables.attendees, ticket, true ] ).map( a => a.name ).sort(),
				attendees: alasql('SELECT name FROM ? WHERE post_state = "" AND ticket = ? AND coupon = "" ORDER BY name', [ self._tables.attendees, ticket ] ).map( a => a.name ).sort(),
				unknown_coupon: alasql('SELECT name FROM ? WHERE post_state = "" AND ticket = ? AND is_unknown_coupon = ? ORDER BY name', [ self._tables.attendees, ticket, true ] ).map( a => a.name ).sort(),
				_post_state: alasql('SELECT name, post_state FROM ? WHERE post_state != "" AND ticket = ? ORDER BY name', [ self._tables.attendees, ticket] )
			};

			let sponsors_details = alasql('SELECT name, sponsor_name, coupon FROM ? where post_state = "" AND ticket = ? AND is_sponsor = ? ORDER BY sponsor_name, name', [self._tables.attendees, ticket, true] );
			self.stats.tickets[ ticket ].sponsors = { _total: 0 };
			sponsors_details.forEach( function( el ) {
				if ( typeof self.stats.tickets[ ticket ].sponsors[ el.sponsor_name ] === 'undefined' ) {
					self.stats.tickets[ ticket ].sponsors[ el.sponsor_name ] = {}
				}
				self.stats.tickets[ ticket ].sponsors[ el.sponsor_name ][ el.name ] = el.coupon.replace( /^SPNS-((\w+)-\d+).*/, '$1' );
				self.stats.tickets[ ticket ].sponsors._total++;
			});

			// Add counters
			self.stats.tickets[ ticket ]._total = self.stats.tickets[ ticket ].organizers.length + self.stats.tickets[ ticket ].speakers.length + self.stats.tickets[ ticket ].sponsors._total + self.stats.tickets[ ticket ].volunteers.length + self.stats.tickets[ ticket ].attendees.length + self.stats.tickets[ ticket ].unknown_coupon.length;
		});
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

				this.getAttendees();

				let summary = '';
				this._tables.tickets.forEach( el => {
					summary += `<h2>${ el.ticket }: ${ this.stats.tickets[ el.ticket ]._total }</h2>`;

					for (const [key, value] of Object.entries( this.stats.tickets[ el.ticket ] ) ) {
						if ( /^_/.test( key ) ) {
							continue;
						}
						summary += `<div><span class="label">${key}</span>: <span class="value">${ 'sponsors' === key ? value._total : value.length}</span></div>`;
					}
				});

				this.openModal( { title: 'Tickets info', content: `\
<h2 class="nav-tab-wrapper wordcamp-bookmarklet">\
	<a class="nav-tab nav-tab-active wordcamp-bookmarklet">Summary</a>\
	<a class="nav-tab wordcamp-bookmarklet">Charts</a>\
	<a class="nav-tab wordcamp-bookmarklet">JSON Data viewer</a>\
	<a class="nav-tab wordcamp-bookmarklet">Credits</a>\
</h2>\
<section class="wordcamp-bookmarklet">\
<div class="summary">${summary}</div>\
</section>\
<section class="wordcamp-bookmarklet">\
	<div class="wordcamp-bookmarklet-tickets-container">\
		<canvas id="wordcamp-bookmarklet-tickets-chart"></canvas>\
	</div>\
</section>\
<section class="wordcamp-bookmarklet"><pre class="json-viewer"/></section>
<section class="wordcamp-bookmarklet">\
<div class="summary">
2026 - WordPress Italia Community & Enrico Sorcinelli - <a href="https://github.com/WP-Italia-Community/wordcamp-bookmarklet" target="_blank">https://github.com/WP-Italia-Community/wordcamp-bookmarklet</a>
</div>\
</section>\
` } );

				// Tab managements.
				$( '.nav-tab-wrapper.wordcamp-bookmarklet a' ).on( 'click', function () {
					$( '.nav-tab' ).removeClass( 'nav-tab-active' );
					$( this ).addClass( 'nav-tab-active' );
					$( 'section.wordcamp-bookmarklet' )
						.hide()
						.eq( $( this ).index() ).show();
					return false;
				} );

				this.createTicketChars();

				// Add JSON data.
				let json_viewer = new JsonEditor( '.wordcamp-bookmarklet-modal-body .json-viewer', undefined, { editable: false, collapsed: true } );
				json_viewer.load( this.stats );
			}
		);
	}

	/**
	 * Get date from column.
	 */
	getDate( string ) {
		let date = string.replace( /^\s*(published|pubblicato)\s*((\d+)\/(\d+)\/(\d+)).*/i, '$2' );
		if ( 'Pubblicato' === RegExp.$1 ) {
			date = RegExp.$5 + '/' + RegExp.$4 + '/' + RegExp.$3;
		}
		return date;
	}

	/**
	 * Create charts.
	 */
	createTicketChars() {

		// Last ticket.
		let last_ticket = alasql( 'SELECT date FROM ? WHERE post_state = "" ORDER BY id DESC LIMIT 1', [ this._tables.attendees] );

		// Get sold tickets (any type).
		let total_tickets_sold = alasql( 'SELECT date, COUNT(*) AS c FROM ? WHERE post_state = "" AND coupon = "" AND ticket_price > 0 GROUP BY date ORDER BY date asc', [ this._tables.attendees ] );

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
				label: 'Day by Day',
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
			let tickets_sold = alasql( 'SELECT date, COUNT(*) AS c FROM ? WHERE post_state = "" AND ticket = ? GROUP BY date ORDER BY date asc', [ this._tables.attendees, ticket ] );
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
		);
	}

	/**
	 * Generate date range array.
	 *
	 * return {Array}
	 */
	generateDateRange( start, end  ) {
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
	 *
	 * @param args
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
	 * Dev helper util avoiding page reload on code changes.
	 */
	destroy() {
		$( '#wordcamp-bookmarklet').remove();
		this.closeModal();
		delete window.WordCamp;
	}
};

})( jQuery );
