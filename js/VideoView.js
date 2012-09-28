/*
 * VideoView.js
 *
 */
var VideoView = Backbone.View.extend({
	'template': _.template($('#video-player-template').html()),
	'defaults': {
		'wmode': 'transparent',
		'height': '420',
		'width': '740',
		'volume': '40',
		'playerVars': {
			'wmode': 'transparent',
			'origin': 'http://www.youtube.com',
			'enablejsapi': 1,
			'autoplay': 0,
			'controls': 0,
			'iv_load_policy': 3,
			'showinfo': 0,
			'rel': 0,
			'allowfullscreen': 0,
			'allowtransparency': 'yes'
		}
	},

	'events': {
		'click #volume': 'setVolume',
		'click #mute': 'toggleMute',
		'click #toggle': 'togglePlay',
		'click #play': 'togglePlay',
		'click #progress': 'seek',
		'click #fullscreen': 'toggleFullscreen',
		'mouseover': 'showControls',
		'mouseout': 'hideControls'
	},

	'showControls': function() {
		if (!this.isReady) {
			return;
		}
		this.isHovered = true;
		this.$el.addClass('hover');
	},

	'hideControls': function() {
		if (!this.isReady) {
			return;
		}
		this.isHovered = false;
		this.$el.removeClass('hover');
	},

	'initialize': function(options) {
		_.bindAll(this);

		var view = this;
		view.o = $.extend(true, view.defaults, options);
		view.isPlaying = false;
		view.isEnded = false;
		view.isReady = false;
		view.subviews = {};

		clearInterval(App.intervals.bufferInterval);

		// escape key support for full screen mode
		$(document).on('keyup', view.toggleFullscreen);

		App.bind('load:image', view.stop);
		App.bind('route:client', view.stop);
		App.bind('route:page', view.stop);
		App.bind('route:modal', view.stop);
		App.bind('route:campaign', view.stop);

		view.bind('end:video', function() {
			clearInterval(App.intervals.bufferInterval);
			view.isPlaying = false;
			view.isEnded = true;
			view.updateProgress();
			view.$el.removeClass('playing').addClass('stopped');
			App.trigger('end:video');
			view.ytplayer.stopVideo();
		});

		view.bind('play:video', function(e) {
			if (!view.isPlaying) {
				view.isPlaying = true;
				App.intervals.bufferInterval = setInterval(view.updateProgress, 1000);
				view.$el.removeClass('stopped').addClass('playing');
				view.updateControls();
				if (!this.isHovered) {
					view.hideControls();
				}
				App.trigger('play:video', {
					'client': this.o.client,
					'title': this.o.title
				});
			}
		});

		view.bind('pause:video', function() {
			clearInterval(App.intervals.bufferInterval);
			view.isPlaying = false;
			view.$el.removeClass('playing');
			App.trigger('pause:video');
		});

		view.bind('stop:video', function() {
			clearInterval(App.intervals.bufferInterval);
			view.isPlaying = false;
			App.trigger('stop:video', {
				'client': this.o.client,
				'title': this.o.title
			});
		});

		view.bind('buffer:video', function() {
			App.trigger('buffer:video', {
				'client': this.o.client,
				'title': this.o.title
			});
		});

		view.bind('load:video', view.loadById);

		view.onPlayerReady = function() {
			view.$play = view.$el.find('#play');
			view.$volume = view.$el.find('#volume')
			view.$volumeLevel = view.$volume.find('#level');
			view.$elapsedTime = view.$el.find('#elapsed');
			view.$controls = view.$el.find('#controls');
			view.$counter = view.$el.find('#counter');
			view.$duration = view.$el.find('#duration');
			view.updateControls();
			view.ytplayer.setVolume(view.o.volume);
			view.isReady = true;

			if (view.o.onPlayerReadyCallback) {
				view.o.onPlayerReadyCallback.apply(view);
			}
		};

		view.onPlayerStateChange = function(e) {
			if (e.data === 0) {
				view.trigger('end:video');
			}
			if (e.data === 3) {
				view.trigger('buffer:video');
			}
			if (e.data === 1) {
				view.trigger('play:video');
			}
			if (e.data === 2) {
				view.trigger('pause:video');
			}
			if (e.data === -1) {
				view.trigger('unstarted:video');
			}
		};

		//First load, if YT api downloads after the view is ready
		App.bind('youtubeapi:ready', view.render);
		//Subsequent views
		if (App.config.get('youtubeapiready') === true) {
			view.render();
		}

		log('Backbone : VideoView : Initialized');
	},

	'render': function() {
		var view = this;
		view.$el.html(view.template({
			'id': view.o.title
		})).addClass('active stopped').siblings().removeClass('active');

		view.ytplayer = new YT.Player('player-' + view.o.title, {
			'wmode': view.o.wmode,
			'id': 'player-' + view.o.title,
			'videoId': view.o.id,
			'height': view.o.height,
			'width': view.o.width,
			'playerVars': view.o.playerVars,
			'events': {
				'onReady': view.onPlayerReady,
				'onStateChange': view.onPlayerStateChange
			}
		});

		return this;
	},

	'loadById': function(id) {
		if (id === this.o.id) {
			this.ytplayer.playVideo();
		} else {
			this.stop();
			this.o.id = id;
			if (App.config.get('isIpad')) {
				delete this.ytplayer;
				this.render();
			} else {
				this.ytplayer.loadVideoById(id);
			}
		}
		this.$el.addClass('active').siblings().removeClass('active');			
	},

	'getElapsed': function() {
		return (this.ytplayer.getCurrentTime() / this.ytplayer.getDuration()) * 100;
	},

	'getBuffered': function() {
		return (this.ytplayer.getVideoBytesLoaded() / this.ytplayer.getVideoBytesTotal()) * 100;
	},

	'updateControls': function() {
		this.$el.find('#duration').html(this.formatTime(this.ytplayer.getDuration()));
		this.updateSharing();
	},

	'updateProgress': function() {
		var view = this,
			elapsed = this.getElapsed();

		this.$elapsedTime.css('width', elapsed + '%');
		$('#buffer').css('width', this.getBuffered() + '%');
		this.$counter.html(this.formatTime(Math.ceil(this.ytplayer.getCurrentTime())));

		App.trigger('progress:video', {
			'client': this.o.client,
			'title': this.o.title,
			'elapsed': elapsed
		});
	},

	'setVolume': function(e) {
		if (!this.isReady) {
			return;
		}

		var offset = (e.offsetX == undefined) ? (e.clientX - this.$volume.offset().left) : e.offsetX;
		this.o.volume = Math.round(offset / (this.$volume.width() + 7) * 100);
		this.ytplayer.setVolume(this.o.volume);
		this.$volumeLevel.css('width', this.o.volume + '%');
	},

	'toggleMute': function() {
		if (!this.isReady) {
			return;
		}
		if (this.ytplayer.isMuted()) {
			this.ytplayer.unMute();
			this.ytplayer.setVolume(this.o.volume);
			this.$volumeLevel.css('width', this.o.volume + '%');
		} else {
			this.ytplayer.mute();
			this.$volumeLevel.css('width', '0%');
		}
	},

	'stop': function() {
		if (!this.isReady) {
			return;
		}

		this.ytplayer.stopVideo();
		this.trigger('stop:video');
	},

	'togglePlay': function(e) {
		if (!this.isReady) {
			return;
		}

		if (this.isPlaying) {
			this.ytplayer.pauseVideo();
		} else {
			this.ytplayer.playVideo();
		}
	},

	'seek': function(e) {
		if (!this.isReady) {
			return;
		}
		clearInterval(App.intervals.bufferInterval);
		var ratio = e.offsetX / ($('#progress').width() + 7);
		var seek = Math.round(this.ytplayer.getDuration() * ratio);
		this.$elapsedTime.css('width', ratio * 100 + '%');
		this.$counter.html(this.formatTime(seek));
		this.isPlaying = false;
		this.ytplayer.seekTo(seek, true);

		App.trigger('seek:video', {
			'client': this.o.client,
			'title': this.o.title,
			'seek': this.formatTime(seek)
		});
	},

	'formatTime': function(second, hour, minute) {
		if (second > 3600) {
			var ore = Math.floor(second / 3600);
			if (ore < 10) {
				ore = '0' + ore;
			}
			var rest = Math.ceil(second % 3600);
			var format = this.formatTime(rest, ore);
		} else if (second > 60) {
			var minuti = Math.floor(second / 60);
			if (minuti < 10) {
				minuti = '0' + minuti;
			}
			var rest = Math.ceil(second % 60);
			var format = this.formatTime(rest, ore, minuti);
		} else if (second < 60) {
			if (!hour) {
				hour = '00';
			}
			if (!minute) {
				minute = '00';
			}
			if (!second) {
				second = '00';
			} else {
				second = Math.round(second);
				if (second < 10) {
					second = '0' + second;
				}
			}
			var format = minute + ':' + second;
		}
		return format;
	},

	'updateSharing': function() {
		var view = this;
		if (view.subviews.shareView == undefined) {
			view.subviews.shareView = new ShareView({
				'el': view.$el.find('#share'),
				'model': new ShareModel()
			});
		}
	},

	'toggleFullscreen': function(e) {
		if (!this.isReady) {
			return;
		}
		var $body = $(document.body);

		if ((typeof e.keyCode != 'undefined' && !($body.hasClass('fullscreen'))) || (typeof e.keyCode != 'undefined' && e.keyCode != 27)) {
			return;
		}

		if ($body.hasClass('fullscreen')) {
			$body.removeClass('fullscreen');
			this.ytplayer.setSize(this.o.width, this.o.height);
		} else {
			$body.addClass('fullscreen video');
			this.ytplayer.setSize(window.outerWidth, window.outerHeight);
		}
	},

	'onClose': function() {
		$(document).off('keyup');
		this.isReady = false;
		delete this.ytplayer;
	}
});