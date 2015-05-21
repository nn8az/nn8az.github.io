// This function allows you to instantiate a fabric.Image object
// out of imageData.
fabric.Image.fromImgData = function(imgData, callback) {
	var canvas = document.createElement('canvas');
	canvas.width = imgData.width;
	canvas.height = imgData.height;

	var ctx = canvas.getContext('2d');
	ctx.putImageData(imgData, 0, 0);

	fabric.Image.fromURL(canvas.toDataURL(), callback);
}

// This class handles the last page that allows the user to perform Poisson
// Image editing.
function PagePoisson(overlayData, backgroundData) {

	var contents = $.parseHTML(''+
		'<div>4. Move, scale, rotate the overlay and click render when you are ready.</div>'
		);

	var canvas = document.createElement('canvas');
	canvas.width = 100;
	canvas.height = 100;
	canvas.id = 'myCanvas';

	var uiBlocker = $('#block');

	var overlay = false;

	var background = false;

	var boundingBox = false;

	this.render = function() {
		// Populate the page with contents.
		$('#content').append(contents);
		$('#content').append(canvas);

		// Use fabric.js to represent the canvas instead of DOM.
		canvas = new fabric.Canvas('myCanvas', {selection: false});
		canvas.setHeight(backgroundData.height);
		canvas.setWidth(backgroundData.width);

		// Load the background image.
		fabric.Image.fromImgData(backgroundData, function(dummy){
			background = dummy;
			background.set('selectable', false);
			setupCanvas();
		});

		// Load the overlay image.
		fabric.Image.fromImgData(overlayData, function(dummy){
			overlay = dummy;
			setupCanvas();
		});
	}

	// This function sets up the canvas. The function will run its
	// main subroutine only when both images are loaded.
	function setupCanvas() {
		// Return if both images are not loaded.
		if (!overlay) return;
		if (!background) return;

		// Ensure that the overlay is small enough to fit within the canvas.
		var widthFactor = overlay.width / background.width;
		var heightFactor = overlay.height / background.height;
		var maxFactor = Math.max(widthFactor, heightFactor);
		if (maxFactor > 0.8) {
			overlay.height *= 0.8 / maxFactor;
			overlay.width *= 0.8 / maxFactor;
		}

		// Add both images onto the canvas
		canvas.add(background);
		canvas.add(overlay);

		// Popup the render button
		$('#popup').html('<div class="small-btn yes-btn" style="width: 100px">Render</div>');
		$('#popup').show().css({bottom: -$('#popup').outerHeight()}).animate({bottom: 0});
		$('#popup div.yes-btn').click(function() {
			uiBlocker.fadeIn(300, applyPoisson);
		});
	}

	function applyPoisson() {
		// Disable canvas selection.
		canvas.forEachObject(function(obj) {
			obj.selectable = false;
		});
		
		// Create a bounding box.
		boundingBox = overlay.getBoundingRect();
		boundingBox.left = Math.floor(boundingBox.left);
		boundingBox.top = Math.floor(boundingBox.top);
		boundingBox.width = Math.ceil(boundingBox.width);
		boundingBox.height = Math.ceil(boundingBox.height);
		
		// Get the imageData of the overlay.
		var ctx = canvas.getContext('2d');
		canvas.remove(background);
		canvas.deactivateAll().renderAll(); // Removes the image controller before saving the image.
		var overlayData = ctx.getImageData(boundingBox.left, boundingBox.top, boundingBox.width, boundingBox.height);
		canvas.add(background);

		// Get the imageData of the background.
		canvas.remove(overlay);
		var backgroundData = ctx.getImageData(boundingBox.left, boundingBox.top, boundingBox.width, boundingBox.height);
		canvas.add(overlay);

		// Setup the metadata.
		var metadata = setupMeta(overlayData);
		var indexMap = metadata.indexMap;

		// Build the matrix & solve the equations.
		var equation = matrixBuilder(metadata, overlayData, backgroundData);
		var solution = [];
		for (var c = 0; c < 3; c++) {
			solution[c] = sorSolver(equation.A, equation.b[c], 1.9, equation.sol[c]);
		}
		
		// Convert the solution into imageData.  Paint the solution on top of the background.
		var solutionData = ctx.createImageData(backgroundData.width, backgroundData.height);
		solutionData.data.set(backgroundData.data);
		var dataI = 0;
		for (var y = 0, lenY = backgroundData.height; y < lenY; y++) {
			for (var x = 0, lenX = backgroundData.width; x < lenX; x++, dataI += 4) {
				var solI = indexMap.get(x, y);
				if (solI >= 0) {
					for (var c = 0; c < 3; c++) {
						solutionData.data[dataI + c] = solution[c][solI];
					}
				}
			}
		}

		// Put the solution onto the main canvas.
		canvas.remove(overlay);
		ctx.putImageData(solutionData, boundingBox.left, boundingBox.top);
		uiBlocker.hide();
	}

	function setupMeta(overlayData) {
		// Fill in the values of the indexMap by processing the imageData.
		var indexMap = new Int32Array2D(overlayData.height, overlayData.width);
		// Iterate through each pixel.
		var count = 0,
			i = 0;
		for (var y = 0, lenY = overlayData.height; y < lenY; y++) {
			for (var x = 0, lenX = overlayData.width; x < lenX; x++, i += 4) {
				// If the current pixel is not fully opaque, its index = -1
				if (overlayData.data[i + 3] < 250) { 
					indexMap.set(x, y, -100);
					continue;
				}
				// Loop through top, right, down, left neighboring pixels.
				var dx = [0, 1, 0, -1];
				var dy = [-1, 0, 1, 0];
				var internal = true; // internal = false means the pixel is on the boundary.
				for (var n = 0; n < 4; n++) {
					var neiX = x + dx[n];
					var neiY = y + dy[n];
					var neiI = neiX + neiY * overlayData.width;
					// Skip if out-of-bound.
					if (neiX < 0 || neiX >= overlayData.width || neiY < 0 || neiY >= overlayData.height) {
						continue;
					}
					// If any of the neighbor is not fully opaque, then we're a boundary pixel.
					if (overlayData.data[4 * neiI + 3] < 250) {
						internal = false;
						break;
					}
				}
				if (internal) {
					indexMap.set(x, y, count);
					count++;
				} else {
					indexMap.set(x, y, -1);
				}
			}
		}

		return {
			indexMap : indexMap,
			n : count
		};
	}

	function matrixBuilder(metadata, overlayData, backgroundData) {
		var indexMap = metadata.indexMap,
			n = metadata.n;
		
		// Declare the matrix A, vector b, and the initial solution.
		var A = new Int32Array2D(5, n),
			b = [];
		for (var i = 3; i--;) {
			b[i] = [];
			for (var j = n; j--;) {
				b[i][j] = 0;
			}
		}
		var initialSol = [];
		for (var i = 3; i--;) {
			initialSol[i] = [];
		}
		
		// For each pixel in the overlay.
		var dataI = 0; // Index into the ImageData for pixel (x, y)
		for (var y = 0, lenY = overlayData.height; y < lenY; y++) {
			for (var x = 0, lenX = overlayData.width; x < lenX; x++, dataI += 4) {
				// Get the pixel's index.
				var pixIndex = indexMap.get(x, y);
				// Don't set an equation for no-op or boundary pixels.
				if (pixIndex < 0) {
					continue;
				}
				// Sets up a row of equation if it's an internal pixel.
				var neiCount = 0,
					writeIndex = 0,
					pixColor = [];
					for (var c = 0; c < 3; c++) {
						pixColor[c] = overlayData.data[dataI + c];
					}

				// Loops through the 4 adjacent neighbors (U, R, D, L).
				for (var n = 0, dx = [0, 1, 0, -1], dy = [-1, 0, 1, 0]; n < 4; n++) { 
					var neiX = x + dx[n];
					var neiY = y + dy[n];
					// Skip out-of-bound neighbors.
					if (!indexMap.inBound(neiX, neiY)) {
						continue;
					}
					// Process the in-bound neighbors.
					var neiIndex = indexMap.get(neiX, neiY),
						neiDataIndex = dataI + 4 * (dx[n] + lenX * dy[n]);
					// If the neighbor is a boundary pixel, add the background color value
					// to b.
					if (neiIndex == -1) {
						for (var c = 0; c < 3; c++) {
							b[c][pixIndex] += backgroundData.data[neiDataIndex + c];
						}
						neiCount++;
						continue;
					}
					// Sets the row of A and b.
					for (var c = 0; c < 3; c++) {
						neiColor = overlayData.data[neiDataIndex + c];
						b[c][pixIndex] += pixColor[c] - neiColor;
					}
					neiCount++;
					writeIndex++;
					A.set(pixIndex, writeIndex, neiIndex);
				}

				A.set(pixIndex, 0, neiCount);
				// Fill in the remaining spot of A with -1.
				for (var n = writeIndex + 1; n < 5; n++) {
					A.set(pixIndex, n, -1);
				}
				for (var c = 0; c < 3; c++) {
					initialSol[c][pixIndex] = backgroundData.data[dataI + c];
				}
			}
		}
		
		return {
			A : A,
			b : b,
			sol : initialSol
		};
	}

	function sorSolver(A, b, omega, initialSol) {
		var sol = initialSol.slice(),
			count = 0,
			maxDelta = 0;
		while (count < 1000) {
			// Every 25 iterations, we check to see the biggest change made to
			// the solution vector.  If the change isn't significant, the loop
			// stops.
			if (count % 10 == 0) maxDelta = 0;

			for (var i = 0, lenI = b.length; i < lenI; i++) {
				var sigma = 0;
				// Sigma += dot product of ith row of A and solution vector
				for (var j = 1; j < 5; j++) {
					var entryA = A.get(i, j);
					if (entryA == -1) break;
					sigma -= sol[entryA];
				}
				var delta = omega * ((b[i] - sigma) / A.get(i, 0) - sol[i])
				sol[i] += delta;
				if (count % 10 == 0 && delta > maxDelta) maxDelta = Math.abs(delta);
			}

			if (count % 10 == 0 && maxDelta < 10) break;

			count++;
		}
		return sol;
	}

	function Int32Array2D(width, height) {
		this.width = width;
		this.height = height;
		this.data = new Int32Array(width * height);
	}
	Int32Array2D.prototype.get = function(x, y) {
		var i = x * this.width + y;
		return this.data[i];
	}
	Int32Array2D.prototype.set = function(x, y, val) {
		var i = x * this.width + y;
		this.data[i] = val;
	}
	Int32Array2D.prototype.inBound = function(x, y) {
		if (x < 0 || x >= this.height || y < 0 || y >= this.width) return false;
		return true;
	}
}
