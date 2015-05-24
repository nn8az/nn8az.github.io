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

	// Data members.
	var contents = $.parseHTML(''+
		'<div>4. Move, scale, rotate the overlay and click render when you are ready.</div>'
		);

	var canvas = document.createElement('canvas');
	canvas.width = 100;
	canvas.height = 100;
	canvas.id = 'myCanvas';

	var processingScreen = $('#block');

	var uiDisabler = $('#disabler');

	var popup = $('#popup');
	popup.slideIn = function() {
		popup.show();
		popup.css({bottom: -popup.outerHeight()});
		popup.animate({bottom: 0});
	}
	popup.slideOut = function(callback) {
		popup.animate({
				bottom: -popup.outerHeight()
			}, function(){
				if (typeof callback !== 'undefined') callback();
			});
	}

	var metadata = false;

	var overlay = false;

	var background = false;

	var boundingBox = false;

	this.render = function() {
		// Populate the page with contents.
		$('#content').append(contents);
		$('#content').append(canvas);

		// Wrap the <canvas> with Fabric canvas object.
		canvas = new fabric.Canvas('myCanvas', {selection: false});
		canvas.setHeight(backgroundData.height);
		canvas.setWidth(backgroundData.width);

		// Load the background image.
		fabric.Image.fromImgData(backgroundData, function(dummy){
			background = dummy;
			background.set('selectable', false);
			setupImages();
		});

		// Load the overlay image.
		fabric.Image.fromImgData(overlayData, function(dummy){
			overlay = dummy;
			setupImages();
		});
	}

	// This function sets up the canvas. The function will run its
	// main subroutine only when both images are loaded.
	function setupImages() {
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

		initializeCanvas();
	}

	// This function restore the canvas and the page to the initial state.
	function initializeCanvas() {
		// Add both images onto the canvas
		canvas.clear();
		canvas.add(background);
		canvas.add(overlay);

		// Popup the render button
		popup.html('<div class="small-btn yes-btn" style="width: 100px">Render</div>');
		popup.slideIn();
		$('#popup div.yes-btn').click(function() {
			popup.slideOut();
			processingScreen.fadeIn(300, applyPoisson);
		});
	}

	// This function fires when the user clicks the 'Render' button. It calls the other
	// function that contains the algorithm for Poisson Image Editing. Once the algorithm
	// finishes, this function presents its output onto the canvas.
	var solution = [false, false, false];
	function applyPoisson() {
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
		metadata = setupMeta(overlayData);

		// Build the matrix
		var equation = matrixBuilder(metadata, overlayData, backgroundData);

		// Create 3 different workers, each solves the equation for one color channel.
		for (var c = 0; c < 3; c++) {
			solution[c] = false;
			var worker = new Worker('scripts/sor.js');
			worker.addEventListener('message', function(e) {
				storeSolution(e.data.sol, e.data.c);
			});
			worker.postMessage({
				A: equation.A,
				b: equation.b[c],
				omega: 1.9,
				initialSol: equation.initialGuess[c],
				color: c
			});
		}
	}

	// This callback function executes whenever the worker finished solving an equation.
	// After all of the workers have solved their equation, the function calls displaySolution().
	function storeSolution(sol, c) {
		console.log('fired', solution.length);
		solution[c] = sol;
		for (var i = 0; i < solution.length; i++) {
			if (!solution[i]) return;
		}
		displaySolution();
	}

	// Display the solution and the pop-up prompt.
	function displaySolution() {
		// Get the background imageData within the bounding box.
		var ctx = canvas.getContext('2d');
		canvas.remove(overlay);
		var backgroundData = ctx.getImageData(boundingBox.left, boundingBox.top, boundingBox.width, boundingBox.height);

		// Convert the solution into imageData.  Paint the solution on top of the background.
		var indexMap = metadata.indexMap;
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
		uiDisabler.show();
		ctx.putImageData(solutionData, boundingBox.left, boundingBox.top);
		processingScreen.hide();

		// Prompt the user for what to do next (save or re-do).
		popup.html('The image is ready! What would you like to do next?<br>' +
		'<div class="small-btn yes-btn">Save</div><div class="small-btn no-btn">Reposition</div>' +
		'<div class="small-btn blue-btn">Make more!</div>');
		popup.slideIn();
		$('#popup div.no-btn').click(function() {
			uiDisabler.hide();
			popup.slideOut(initializeCanvas);
		});
		$('#popup div.yes-btn').click(function() {
			var domCanvas = document.getElementById('myCanvas');
			window.open(domCanvas.toDataURL('image/png'));
		})
		$('#popup div.blue-btn').click(function() {
			uiDisabler.hide();
			restart();
		})
	}

	function restart() {
		$('#content').empty();
		popup.slideOut(function() {
			popup.empty();
			var nextPage = new PageFilePrompt;
			nextPage.render();
		});
	}

	// Below are methods that are responsible for figuring out the imageData of the
	// rendered image.
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
			initialGuess : initialSol
		};
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

