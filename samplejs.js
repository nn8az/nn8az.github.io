var canvas;
var orange;
var apple;
var boundingBox;

window.onload = function() {
	// Encapsulate HTML canvas with Fabric canvas.
	canvas = new fabric.Canvas('myCanvas', {
		selection: false
	});
	
	// Adjust the size.
	canvas.setHeight(window.innerHeight * 4 / 5);
	canvas.setWidth(window.innerWidth * 7 / 8);

	// Add an orange.
	fabric.Image.fromURL('orange.png', function(dummy) {
		orange = dummy;
		orange.set('scaleY', 0.5);
		orange.set('scaleX', 0.5);
		canvas.add(orange);
	}, {crossOrigin: 'anonymous'});
	
	// Add an apple.
	fabric.Image.fromURL('apple.png', function(dummy) {
		apple = dummy;
		canvas.add(apple);
		canvas.sendToBack(apple);
	}, {crossOrigin: 'anonymous'});
}

function button() {
	// Debugging: draw the bounding box.
	boundingBox = orange.getBoundingRect();
	canvas.contextContainer.strokeRect(boundingBox.left, boundingBox.top, boundingBox.width, boundingBox.height);
	
	// Create a secondary canvas.
	var canvasSec = fabric.util.createCanvasElement();
	canvasSec.width = boundingBox.width;
	canvasSec.height = boundingBox.height;
	
	// Get canvas context.
	var ctxSec = canvasSec.getContext('2d');
	
	// Get the orange onto the secondary canvas.
	orange.left -= boundingBox.left;
	orange.top -= boundingBox.top;
	orange.render(ctxSec, false);
	orange.left += boundingBox.left;
	orange.top += boundingBox.top;
	
	// Get the imageData of the canvas.
	var orangeData = ctxSec.getImageData(0, 0, canvasSec.width, canvasSec.height);
	
	// Fill in the values of the indexMap by processing the imageData.
	var indexMap = new Int32Array2D(canvasSec.width, canvasSec.height);
	// Iterate through each pixel.
	var count = 0;
	for (var y = 0; y < orangeData.height; y++) {
		for (var x = 0; x < orangeData.width; x++) {
			var i = x + y * orangeData.width;
			// If the current pixel is not fully opaque, its index = -1
			if (orangeData.data[4 * i + 3] < 250) { 
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
				var neiI = neiX + neiY * orangeData.width;
				// Skip if out-of-bound.
				if (neiX < 0 || neiX >= orangeData.width || neiY < 0 || neiY >= orangeData.height) {
					continue;
				}
				// If any of the neighbor is not fully opaque, then we're a boundary pixel.
				if (orangeData.data[4 * neiI + 3] < 250) {
					internal = false;
					break;
				}
			}
			if (internal) {
				indexMap.set(x, y, count);
				count += 1;
			} else {
				indexMap.set(x, y, -1);
			}
		}
	}
	
	// Get the apple onto the secondary canvas.
	ctxSec.clearRect(0, 0, canvasSec.width, canvasSec.height);
	apple.left -= boundingBox.left;
	apple.top -= boundingBox.top;
	apple.render(ctxSec, false);
	apple.left += boundingBox.left;
	apple.top += boundingBox.top;
	
	// Get the imageData of the apple.
	var appleData = ctxSec.getImageData(0, 0, canvasSec.width, canvasSec.height);
	
	// Build a matrix.
	var indexMapPlus = {
		data : indexMap,
		n : count
	};
	matrixBuilder(indexMapPlus, orangeData, appleData, 0);
	
	// Debugging: display the secondary canvas.
	var debugDiv = document.getElementById("debug");
	while (debugDiv.firstChild) {
		debugDiv.removeChild(debugDiv.firstChild);
	}
	debugDiv.appendChild(orangeData.toCanvas());
	debugDiv.appendChild(indexMap.debugCanvas());
	debugDiv.appendChild(appleData.toCanvas());
}

// This function sets up the matrix A and vector b of the linear equation.
// Matrix A has a unique encoding scheme to conserve memory.
function matrixBuilder(indexMapPlus, orangeData, appleData, colorChannel) {
	// Log the parameters received.
	console.log(indexMapPlus);
	console.log(orangeData);
	console.log(appleData);
	
	var indexMap = indexMapPlus.data;
	var n = indexMapPlus.n;
	
	// Declare the matrix A, and vector b.
	var A = new Int32Array2D(5, n);
	var b = [];
	
	// For each pixel in indexMap.
	for (var y = 0; y < indexMap.height; y++) {
		for (var x = 0; x < indexMap.width; x++) {
			// Get the pixel's index.
			var pixIndex = indexMap.get(x, y);
			// Don't set an equation for irrelevant or boundary pixels.
			if (pixIndex < 0) {
				continue;
			}
			// Sets up a row of equation if it's an internal pixel.
			var dx = [0, 1, 0, -1];
			var dy = [-1, 0, 1, 0];
			var neiCount = 0;
			var divergence = 0;
			var boundarySum = 0;
			var pixColor = orangeData.data[4 * (x + y * orangeData.width) + colorChannel];
			for (var n = 0; n < 4; n++) { // For each neighbor (U, R, D, L).
				var neiX = x + dx[n];
				var neiY = y + dy[n];
				// Skip out-of-bound neighbors.
				if (neiX < 0 || neiX >= indexMap.width || neiY < 0 || neiY >= indexMap.height) {
					continue;
				}
				// Process the in-bound neighbors.
				var neiIndex = indexMap.get(neiX, neiY);
				// If the neighbor is a boundary pixel.
				if (neiIndex == -1) {
					var neiColor = appleData.data[4 * (neiX + neiY * appleData.width) + colorChannel];
					boundarySum += neiColor;
					continue;
				}
				// Sets the row of A and contributes to divergence.
				var neiColor = orangeData.data[4 * (neiX + neiY * orangeData.width) + colorChannel];
				neiCount++;
				A.set(pixIndex, neiCount, neiIndex);
				divergence += pixColor - neiColor;
			}
			A.set(pixIndex, 0, neiCount);
			b[pixIndex] = boundarySum + divergence;
		}
	}
}

function conjGradSolver(A, b) {
}

// This class is used to represent 2D array of ints.
function Int32Array2D(width, height) {
	this.width = width;
	this.height = height;
	this.data = new Int32Array(width * height);
}
Int32Array2D.prototype.get = function(x, y) {
	var i = x + y * this.width;
	return this.data[i];
}
Int32Array2D.prototype.set = function(x, y, val) {
	var i = x + y * this.width;
	this.data[i] = val;
}
Int32Array2D.prototype.debugCanvas = function () {
	var debugCanvas = fabric.util.createCanvasElement();
	debugCanvas.width = this.width;
	debugCanvas.height = this.height;
	var debugCtx = debugCanvas.getContext("2d");
	var debugData = debugCtx.getImageData(0, 0, this.width, this.height);
	
	for (var y = 0; y < this.height; y++) {
		for (var x = 0; x < this.width; x++) {
			var i = x + y * this.width;
			var ii = i * 4;
			debugData.data[ii + 3] = 255;
			// If internal pixels.
			if (this.data[i] >= 0) {
				debugData.data[ii] = 255;
				debugData.data[ii + 1] = 255;
				debugData.data[ii + 2] = 255;
			} else if (this.data[i] == -1) { // If bordering pixels.
				debugData.data[ii] = 255;
				debugData.data[ii + 2] = 255;
			}
		}
	}
	debugCtx.putImageData(debugData, 0, 0);
	return debugCanvas;
}

ImageData.prototype.toCanvas = function() {
	var canvas = fabric.util.createCanvasElement();
	canvas.height = this.height;
	canvas.width = this.width;
	var ctx = canvas.getContext("2d");
	ctx.putImageData(this, 0, 0);
	return canvas;
}