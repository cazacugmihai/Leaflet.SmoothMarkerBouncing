/*
 * Copyright (c) 2015, Alexei KLENIN
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 *   1. Redistributions of source code must retain the above copyright notice,
 *		this list of conditions and the following disclaimer.
 *
 *   2. Redistributions in binary form must reproduce the above copyright
 *		notice, this list of conditions and the following disclaimer in the
 *		documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * Smooth bouncing for Leaflet markers.
 *
 * @author Alexei KLENIN <alexey_klenin@hotmail.fr>
 */
;(function(L) {

	"use strict";

	var regStyle = /([\w-]+): ([^;]+);/g,	// regex to parse style definitions

		/* Cache for motion's data that not depends on x & y:
		 *	- moveSteps
		 *	- moveDelays
		 *	- resizeSteps
		 *	- resizeDelays
		 */
		_bouncingMotionsCache = {};

	/* -------------------------------------------------------------------------
	 * 		In-closure helper functions
	 * -------------------------------------------------------------------------
	 */

	/**
	 * Parse cssText attribute and transform it into Javascript object with
	 * style definitions as the keys.
	 *
	 * @param cssText - cssText string.
	 * 
	 * @return object with style definitions as the keys.
	 */
	function parseCssText(cssText) {
		var styleDefinitions = {},

		match = regStyle.exec(cssText);

		while (match) {
			styleDefinitions[match[1]] = match[2];
			match = regStyle.exec(cssText);
		}

		return styleDefinitions;
	}

	/**
	 * Renders the object with style definitions as string ready to put in
	 * cssText attribute.
	 *
	 * @param styleDefinitions - object with style definitions.
	 *
	 * @return cssText string.
	 */
	function renderCssText(styleDefinitions) {
		var cssText = '',
			key;

		for (key in styleDefinitions) {
			cssText += key + ': ' + styleDefinitions[key] + '; '
		}

		return cssText;
	}

	/**
	 * Calculates the points to draw the continous line on the screen. Returns
	 * the array of ordered point coordinates. Uses Bresenham algorithm.
	 *
	 * @param x - x coordinate of origin;
	 * @param y - y coordinate of origin;
	 * @param angle - angle in radians;
	 * @param length - length of line.
	 *
	 * @return array of ordered point coordinates.
	 *
	 * @see
	 *		http://rosettacode.org/wiki/Bitmap/Bresenham's_line_algorithm#JavaScript
	 */
	function calculateLine(x, y, angle, length) {
		// TODO: use something else than multiply length by 2 to calculate the
		// line with defined length
		var xD = Math.round(x + Math.cos(angle) * (length * 2)),
			yD = Math.round(y + Math.sin(angle) * (length * 2)),

			dx = Math.abs(xD - x),
			sx = x < xD ? 1 : -1,

			dy = Math.abs(yD - y),
			sy = y < yD ? 1 : -1,

			err = (dx > dy ? dx : -dy) / 2,
			e2,

			p = [],
			i = 0;

		while (true) {
			p.push([x, y]);
			i++;
			if (i === length)
				break;
			e2 = err;
			if (e2 > -dx) {
				err -= dy;
				x += sx;
			}
			if (e2 < dy) {
				err += dx;
				y += sy;
			}
		}

		return p;
	}

	/**
	 * This function do the same thing that createMoveTransforms() but
	 * constructs an array of points instead of transformation definitions. Used
	 * to animate marker on the browsers that doesn't support 'transform'
	 * attribute.
	 *
	 * @param x - numeric value of x coordinate of original position of marker;
	 * @param y - numeric value of y coordinate of original position of marker;
	 * @param bounceHeight - height of bouncing (px).
	 *
	 * @return array of points [x, y].
	 */
	function calculateIconMovePoints(x, y, bounceHeight) {
		var p = [],						// array of points
			dY = bounceHeight + 1;		// delta of height

		/* Use fast inverse while loop to fill the array */
		while (dH--) {
			p[dY] = [x, y - dY];
		}

		return p;
	}

	/**
	 * This function do the same thing thn function createShadowMoveTransforms()
	 * but instead of transformation definition calculates the points for the
	 * animation of the movement.
	 *
	 * @param x - numeric value of x coordinate of original position of marker;
	 * @param y - numeric value of y coordinate of original position of marker;
	 * @param bounceHeight - height of bouncing (px);
	 * @param angle - shadow inclination angle (radians).
	 *
	 * @return array of the points [x, y].
	 */
	function calculateShadowMovePoints(x, y, bounceHeight, angle) {
		return calculateLine(x, y, angle, bounceHeight);
	}

	/**
	 * Helper function to create an array of transformation definitions of the
	 * animation of movement. Function defines one transform for every pixel of
	 * shift of marker from it's original y position.
	 *
	 * @param x - numeric value of x coordinate of original position of marker;
	 * @param y - numeric value of y coordinate of original position of marker;
	 * @param bounceHeight - height of bouncing (px).
	 *
	 * @return array of transformation definitions.
	 */
	function calculateIconMoveTransforms(x, y, bounceHeight) {
		var t = [],						// array of transformations
			dY = bounceHeight + 1;		// delta Y

		/* Use fast inverse while loop to fill the array */
		while (dY--) {

			/* Use matrix3d for hardware acceleration */
			t[dY] = ' matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,' + x + ',' + (y - dY)
				+ ',0,1) ';
		}

		return t;
	}

	/**
	 * Helper function to create an array of transformation definitions of the
	 * animation of movement of shadow. Function defines one transform for every
	 * pixel of shift of shadow from it's original position.
	 *
	 * @param x - numeric value of x coordinate of original position of marker;
	 * @param y - numeric value of y coordinate of original position of marker;
	 * @param bounceHeight - height of bouncing (px);
	 * @param angle - shadow inclination angle (radians).
	 *
	 * @return array of transformation definitions.
	 */
	function calculateShadowMoveTransforms(x, y, bounceHeight, angle) {
		// TODO: check this method to know if bounceHeight + 1 is normal
		var t = [],					// array of transformation definitions
			p = calculateLine(x, y, angle, bounceHeight + 1),
			dY = bounceHeight + 1;	// delta Y

		/* Use fast inverse while loop to fill the array */
		while (dY--) {

			/* Use matrix3d for hardware acceleration */
			t[dY] = ' matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,' + p[dY][0] + ','
				+ p[dY][1] + ',0,1) ';
		}

		return t;
	}

	/**
	 * Helper function to create an array of transformation definitions of the
	 * animation of contraction. Function defines one transform for every pixel
	 * of resizing of marker from it's original height.
	 *
	 * @param x - numeric value of x coordinate of original position of marker;
	 * @param y - numeric value of y coordinate of original position of marker;
	 * @param height - original marker's height;
	 * @param contractHeight - height of contraction (px).
	 *
	 * @return array of transformation definitions.
	 */
	function calculateIconResizeTransforms(x, y, height, contractHeight) {
		var t = [],						// array of transformations
			dH = contractHeight + 1;	// delta of height

		/* Use fast inverse while loop to fill the array */
		while (dH--) {

			/* Use matrix3d for hardware acceleration */
			t[dH] = ' matrix3d(1,0,0,0,0,' + ((height - dH) / height)
				+ ',0,0,0,0,1,0,' + x + ',' + (y + dH) + ',0,1) ';
		}

		return t;
	}

	/**
	 * Helper function to create an array of transformation definitions of the
	 * animation of contraction of the shadow. Function defines one transform
	 * for every pixel of resizing of shadow.
	 *
	 * @param x - numeric value of x coordinate of original position of marker;
	 * @param y - numeric value of y coordinate of original position of marker;
 	 * @param width - original shadow's width;
	 * @param height - original shadow's height;
	 * @param contractHeight - height of contraction (px);
	 * @param angle - shadow inclination angle (radians).
	 *
	 * @return array of transformation definitions.
	 */
	function calculateShadowResizeTransforms(x, y, width, height,
			contractHeight, angle) {
		var t = [],						// array of transformation definitions
			p = calculateLine(width, height, angle + Math.PI, contractHeight),
			dH = contractHeight + 1;	// delta height

		/* Use fast inverse while loop to fill the array */
		while (dH--) {

			/* Use matrix3d for hardware acceleration */
			t[dH] = ' matrix3d(' + (width / p[dH][0]) +  ',0,0,0,0,'
				+ (p[dH][1] / height) + ',0,0,0,0,1,0,' + x + ','
				+ (y + height - p[dH][1]) + ',0,1) ';
		}

		return t;
	}

	/**
	 * Returns calculated array of steps of animaton.
	 * This function used to calculate both movement and resizing animations.
	 * Those steps are cached in _bouncingMotionsCache. Function checks this
	 * cache before make any calculations.
	 *
	 * @param height    height of movement or resizing (px);
	 * @param prefix    prefix of the key in the cache. Must be any string with
	 *					trailing "_" caracter.
	 *
	 * @return array of steps of animaton.
	 */
	function calculateSteps(height, prefix) {
		var key = prefix + height,
			steps = [],
			i;

		/* Check the cache */
		if (_bouncingMotionsCache[key]) {
			return _bouncingMotionsCache[key];
		}

		/* Calculate the sequence of animation steps:
		 * steps = [1 .. height] concat [height-1 .. 0]
		 */
		i = 1;
		while (i <= height) {
			steps.push(i++);
		}

		i = height;
		while (i--) {
			steps.push(i);
		}

		/* Save steps to the cache */
		_bouncingMotionsCache[key] = steps;

		return steps;
	}

	/**
	 * Returns calculated array of delays between steps of animation.
	 * This function used to calculate both movement and resizing animations.
	 * Element with index i of this array contains the delay in milliseconds
	 * between step i and step i+1 of animation.
	 * Those delays are cached in _bouncingMotionsCache. Function checks this
	 * cache before make any calculations.
	 *
	 * @param height    height of movement or resizing (px);
	 * @param speed     speed coefficient;
	 * @param prefix    prefix of the key in the cache. Must be any string with
	 *					trailing "_" caracter.
	 *
	 * @return array of delays between steps of animation.
	 */
	function calculateDelays(height, speed, prefix) {
		var key = prefix + height + '_' + speed,
			deltas = [],	// time between steps of animation
			delays = [],	// delays before steps from beginning of animation
			totalDelay = 0,
			l,
			i;

		/* Check the cache */
		if (_bouncingMotionsCache[key]) {
			return _bouncingMotionsCache[key];
		}

		/* Calculate delta time for bouncing animation */

		/* Delta time to movement in one direction */
		deltas[height] = speed;
		deltas[0] = 0;
		i = height;
		while (--i) {
			deltas[i] = Math.round(speed / (height - i));
		}

		/* Delta time for movement in two directions */
		i = height;
		while (i--) {
			deltas.push(deltas[i]);
		}

		/* Calculate move delays (cumulated deltas) */
		// TODO: instead of deltas.lenght write bounceHeight * 2 - 1
		for (i = 0, l = deltas.length; i < l; i++) {
			totalDelay += deltas[i];
			delays.push(totalDelay);
		}

		/* Save move delays to cache */
		_bouncingMotionsCache[key] = delays;

		return delays;
	}

	/* -------------------------------------------------------------------------
	 * 		Class "static" methods
	 * -------------------------------------------------------------------------
	 */

	L.Marker._bouncingMarkers = [];		// array of bouncing markers

	/**
	 * Sets default options of bouncing animation.
	 *
	 * @param options - object with options.
	 */
	// TODO: find more elegant way to extend the marker class in Leaflet
	L.Marker.setBouncingOptions = function(options) {
		// TODO: find more elegant way to merge the options
		for (var option in options) {
			L.Marker.prototype._bouncingOptions[option] = options[option];
		}
	};

	/**
	 * @return array of bouncing markers.
	 */
	L.Marker.getBouncingMarkers = function() {
		return L.Marker._bouncingMarkers;
	};

	/**
	 * Stops the bouncing of all currently bouncing markers. Purge the array of
	 * bouncing markers.
	 */
	L.Marker.stopBouncingMarkers = function() {
		var marker;
		while (marker = L.Marker._bouncingMarkers.shift()) {
			marker._bouncingMotion.isBouncing = false;	// stop bouncing
		}
	};

	/**
	 * Adds the marker to the list of bouncing markers. If flag 'exclusif' is
	 * set to true, stops all bouncing markers before.
	 *
	 * @param marker - L.Marker object;
	 * @param exclusif - flag of exclusif bouncing. If set to true, stops the
	 *		bouncing of all other markers.
	 */
	L.Marker._addBouncingMarker = function(marker, exclusif) {
		if (exclusif || marker._bouncingOptions.exclusif) {
			L.Marker.stopBouncingMarkers();
		} else {
			L.Marker._stopEclusifMarkerBouncing();
		}
		L.Marker._bouncingMarkers.push(marker);
	};

	/**
	 * Removes the marker from the list of bouncing markers.
	 *
	 * @param marker - L.Marker object;
	 */
	L.Marker._removeBouncingMarker = function(marker) {
		var i = L.Marker._bouncingMarkers.length;

		if (i) {
			while (i--) {
				if (L.Marker._bouncingMarkers[i] == marker) {
					L.Marker._bouncingMarkers.splice(i, 1);
					break;
				}
			}
		}
	};

	/**
	 * Stops the bouncing of exclusif marker.
	 */
	L.Marker._stopEclusifMarkerBouncing = function() {
		var i = L.Marker._bouncingMarkers.length;

		if (i) {
			while (i--) {
				if (L.Marker._bouncingMarkers[i]._bouncingOptions.exclusif) {
					L.Marker._bouncingMarkers[i]._bouncingMotion.isBouncing =
						false;	// stop bouncing
					L.Marker._bouncingMarkers.splice(i, 1);
				}
			}
		}
	};

	/* -------------------------------------------------------------------------
	 * 		L.Marker.prototype methods (shared by all instances)
	 * -------------------------------------------------------------------------
	 */

	/* Default bouncing animation properties */
	L.Marker.prototype._bouncingOptions = {
		bounceHeight   : 15,	// how high marker can bounce (px)
		contractHeight : 12,	// how much marker can contract (px)
		bounceSpeed	   : 52,	// bouncing speed coefficient
		contractSpeed  : 52,	// contracting speed coefficient
		shadowAngle	   : - Math.PI / 4, // shadow inclination angle (radians)
		elastic	       : true,	// activate contract animation
		exclusif 	   : false,	// many markers can bounce in the same time 
	};

	/**
	 * Registers options of bouncing animation for this marker.
	 * After registration of option for concreet marker, it no more references
	 * default options.
	 * Function automatically recalculates animation steps and delays.
	 *
	 * @param options    options object.
	 *
	 * @return this marker
	 */
	L.Marker.prototype.setBouncingOptions = function(options) {

		/* If _bouncingOptions was not redefined yet for this marker create
		 * own property.
		 */
		if (!this.hasOwnProperty('_bouncingOptions')) {
			this._bouncingOptions = {};
		}

		for (var option in L.Marker.prototype._bouncingOptions) {
			if (options.hasOwnProperty(option)) {
				/* Copy passed option's value */
				this._bouncingOptions[option] = options[option];
			} else {
				/* Copy default option's value */
				this._bouncingOptions[option] =
					L.Marker.prototype._bouncingOptions[option];
			}
		}

		/* Recalculate steps & delays of movement & resize animations */
		this._calculateTimeline();

		/* Recalculate transformations */
		this._calculateTransforms();

		return this;	// fluent API
	};

	/**
	 * Returns true if this marker is bouncing. If this marker is not bouncing
	 * returns false.
	 *
	 * @return true if marker is bouncing, false if not.
	 */
	L.Marker.prototype.isBouncing = function() {
		return this._bouncingMotion.isBouncing;
	};

	/**
	 * Let's bounce now!
	 *
	 * @param times    number of repeations of animation (optional)
	 *
	 * @return this marker
	 */
	L.Marker.prototype.bounce = function() {
		var marker = this,
			icon = this._icon,
			shadow = this._shadow,

			bouncingOptions = marker._bouncingOptions,
			motion = marker._bouncingMotion,

			bounceHeight = bouncingOptions.bounceHeight,
			contractHeight = bouncingOptions.contractHeight,
			bounceSpeed = bouncingOptions.bounceSpeed,
			contractSpeed = bouncingOptions.contractSpeed,
			shadowAngle = bouncingOptions.shadowAngle,
			elastic = bouncingOptions.elastic,
			exclusif = bouncingOptions.exclusif,

			moveSteps = motion.moveSteps,
			moveDelays = motion.moveDelays,
			resizeSteps = motion.resizeSteps,
			resizeDelays = motion.resizeDelays,

			nbMoveSteps = moveSteps.length,
			nbResizeSteps = resizeSteps.length,

			baseIconCssText = motion.baseIconCssText,
			baseShadowCssText = motion.baseShadowCssText,

			is3d = L.Browser.any3d,
			transform = L.DomUtil.TRANSFORM,

			times = null;	// null for infinite bouncing

		if (arguments.length == 1) {
			times = arguments[0];
		}

		/**
		 * Makes the step of the movement animation.
		 *
		 * @param step    step number
		 */
		function makeMoveStep(step) {

			/* Reset icon's cssText */
			icon.style.cssText = baseIconCssText
				+ 'z-index: ' + marker._zIndex + ';'
				+ transform + ': ' + motion.iconMoveTransforms[step];

			/* Reset shadow's cssText */
			shadow.style.cssText = baseShadowCssText
				+ transform + ': '
				+ motion.shadowMoveTransforms[step];
		}

		/**
		 * Makes the step of the movement animation in no 3D web browser.
		 *
		 * @param step    step number
		 */
		function makeMoveStepNo3D(step) {

			/* Reset icon's cssText */
			icon.style.cssText = baseIconCssText
				+ 'z-index: ' + marker._zIndex + ';';
			icon.style.left = motion.iconMovePoints[step][0] + 'px';
			icon.style.top  = motion.iconMovePoints[step][1] + 'px';

			/* Reset shadow's cssText */
			shadow.style.cssText = baseShadowCssText;
			icon.style.left = motion.shadowMovePoints[step][0] + 'px';
			icon.style.top =  motion.shadowMovePoints[step][1] + 'px';
		}

		/**
		 * Makes the step of resizing animation.
		 *
		 * @param step    step number
		 */
		function makeResizeStep(step) {

			/* Reset icon's cssText */
			icon.style.cssText = baseIconCssText
				+ 'z-index: ' + marker._zIndex + ';'
				+ transform + ': ' + motion.iconResizeTransforms[step];

			/* Reset shadow's cssText */
			shadow.style.cssText = baseShadowCssText
				+ transform + ': '
				+ motion.shadowResizeTransforms[step];
		}

		/**
		 * Moves the marker up & down.
		 */
		function move() {
			if (times !== null) {
				if (!--times) {
					motion.isBouncing = false;	// this is the last bouncing
				}
			}

			var i = nbMoveSteps;

			/* Lauch timeouts for every step of the movement animation */
			if (is3d) {
				while (i--) {
					setTimeout(
						makeMoveStep,
						moveDelays[i],
						moveSteps[i]);
				}
			} else {
				while (i--) {
					setTimeout(
						makeMoveStepNo3D,
						moveDelays[i],
						moveSteps[i]);
				}
			}

			/* At the end of movement animation check if continue the
			 * bouncing with rezise animation, move animation or stop it.
			 */
			// TODO: longer timeout if there is not resize part of animation
			setTimeout(function() {
				if (elastic && is3d) {
					resize();	// possible only in 3D able browsers
				} else if (motion.isBouncing) {
					setTimeout(move, bounceSpeed);
					//move();
				}
			}, moveDelays[nbMoveSteps - 1]);
		}

		/**
		 * Contracts & expands the marker.
		 */
		function resize() {
			var i = nbResizeSteps;

			/* Lauch timeouts for every step of the contraction animation */
			while (i--) {
				setTimeout(
					makeResizeStep,
					resizeDelays[i],
					resizeSteps[i]);
			}

			/* At the end of contraction animation check if continue the
			 * bouncing with move animation or stop it.
			 */
			setTimeout(function() {
				if (motion.isBouncing) {
					move();
				}
			}, resizeDelays[nbResizeSteps - 1]);
		}

		motion.isBouncing = true;
		L.Marker._addBouncingMarker(marker, exclusif);
		move();		// start animation

		return marker;	// fluent API
	};

	/**
	 * Stops the bouncing of the marker. Note: the bouncing not stops
	 * immediatly after the call of this method. Instead, the animation
	 * executed until the marker returns to it's original position and takes
	 * it's full size.
	 *
	 * @return this marker
	 */
	L.Marker.prototype.stopBouncing = function() {
		this._bouncingMotion.isBouncing = false;
		L.Marker._removeBouncingMarker(this);

		return this;	// fluent API
	};

	/**
	 * Toogle the bouncing on the marker.
	 *
	 * @return this marker
	 */
	L.Marker.prototype.toogleBouncing = function() {
		if (this._bouncingMotion.isBouncing) {
			this.stopBouncing();
		} else {
			this.bounce();
		}

		return this;	// fluent API
	};

	/**
	 * Helper function to calculate moveSteps, moveDelays, resizeSteps &
	 * resizeDelays of marker.
	 */
	L.Marker.prototype._calculateTimeline = function() {

		/*
		 * Animation is defined by shifts of the marker from it's original
		 * position. Each step of the animation is a shift of 1px.
		 *
		 * We define function f(x) - time of waiting between shift of x px and
		 * shift of x+1 px.
		 *
		 * We use for this the inverse function f(x) = a / x; where a is the
		 * animation speed and x is the shift from original position in px.
		 */

		/* recalculate steps & delays of movement & resize animations */
		this._bouncingMotion.moveSteps = calculateSteps(
			this._bouncingOptions.bounceHeight,
			'moveSteps_'
		);

		this._bouncingMotion.moveDelays = calculateDelays(
			this._bouncingOptions.bounceHeight,
			this._bouncingOptions.bounceSpeed,
			'moveDelays_'
		);

		this._bouncingMotion.resizeSteps = calculateSteps(
			this._bouncingOptions.contractHeight,
			'resizeSteps_'
		);

		this._bouncingMotion.resizeDelays = calculateDelays(
			this._bouncingOptions.contractHeight,
			this._bouncingOptions.contractSpeed,
			'resizeDelays_'
		);
	};

	/**
	 * Helper function to calculate the trasformations of marker.
	 */
	L.Marker.prototype._calculateTransforms = function() {
		if (L.Browser.any3d) {

			/* Calculate transforms for 3D browsers */

			/* Calculate move transforms of icon */
			this._bouncingMotion.iconMoveTransforms =
				calculateIconMoveTransforms(
					this._bouncingMotion.x,
					this._bouncingMotion.y,
					this._bouncingOptions.bounceHeight
				);

			/* Calculate resize transforms of icon */
			this._bouncingMotion.iconResizeTransforms =
				calculateIconResizeTransforms(
					this._bouncingMotion.x,
					this._bouncingMotion.y,
					this.options.icon.options.iconSize[1],
					this._bouncingOptions.contractHeight
				);

			/* Calculate move transformations of shadow */
			this._bouncingMotion.shadowMoveTransforms =
				calculateShadowMoveTransforms(
					this._bouncingMotion.x,
					this._bouncingMotion.y,
					this._bouncingOptions.bounceHeight,
					this._bouncingOptions.shadowAngle
				);

			/* Calculate resize transforms of shadow */
			// TODO: use function calculateShadowResizeTransforms
			this._bouncingMotion.shadowResizeTransforms =
				calculateIconResizeTransforms(
					this._bouncingMotion.x,
					this._bouncingMotion.y,
					this.options.icon.options.shadowSize[1],
					this._bouncingOptions.contractHeight
				);

		} else {

			/* Calculate move points */

			/* For the icon */
			this._bouncingMotion.iconMovePoints = calculateIconMovePoints(
				this._bouncingMotion.x,
				this._bouncingMotion.y,
				this._bouncingOptions.bounceHeight
			);

			/* And for the shadow */
			this._bouncingMotion.shadowMovePoints = calculateShadowMovePoints(
				this._bouncingMotion.x,
				this._bouncingMotion.y,
				this._bouncingOptions.bounceHeight,
				this._bouncingOptions.shadowAngle
			);

		}
	};

	// TODO: decide to redeclare ether only public or only private methods
	var oldInitialize = L.Marker.prototype.initialize;
	var oldSetPos = L.Marker.prototype._setPos;
	var oldOnAdd = L.Marker.prototype.onAdd;

	/**
	 * Redeclaration of function initialize.
	 *
	 * @param latlng - latitude-longitude object.
	 */
	L.Marker.prototype.initialize = function(latlng, options) {
		oldInitialize.call(this, latlng, options);

		var bounceHeight   = this._bouncingOptions.bounceHeight,
			bounceSpeed    = this._bouncingOptions.bounceSpeed,
			contractHeight = this._bouncingOptions.contractHeight,
			contractSpeed  = this._bouncingOptions.contractSpeed;

		/* Calculate steps & delays of movement & resize animations */
		this._bouncingMotion = {
			isBouncing: false
		};
		this._calculateTimeline();
	};

	/**
	 * Redeclaration of onAdd() function.
	 *
	 * @param map - map object.
	 */
	L.Marker.prototype.onAdd = function(map) {
		oldOnAdd.call(this, map);

		/* Create base cssText */
		var styles = parseCssText(this._icon.style.cssText);
		delete styles.transform;	// delete old trasform style definition
		delete styles['z-index'];	// delete old z-index
		this._bouncingMotion.baseIconCssText = renderCssText(styles);

		/* Create base cssText for shadow */
		styles = parseCssText(this._shadow.style.cssText);
		delete styles.transform;	// delete old trasform style definition
		this._bouncingMotion.baseShadowCssText = renderCssText(styles);
	};

	/**
	 * Redeclaration of _setPos() function.
	 */
	L.Marker.prototype._setPos = function(pos) {
		oldSetPos.call(this, pos);
		this._bouncingMotion.x = pos.x;
		this._bouncingMotion.y = pos.y;
		this._calculateTransforms();
	};

})(L);
