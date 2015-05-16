var canvas,
	orange,
	apple,
	boundingBox;

window.onload = function() {
	// Encapsulate HTML canvas with Fabric canvas.
	canvas = new fabric.Canvas('myCanvas', {
		selection: false
	});
	
	// Adjust the size.
	canvas.setHeight(window.innerHeight * 4 / 5);
	canvas.setWidth(window.innerWidth * 7 / 8);

	// Add an orange.
	fabric.Image.fromURL('samples/orange.png', function(dummy) {
		orange = dummy;
		orange.set('left', 25);
		orange.set('top', 35);
		orange.set('scaleY', 0.4);
		orange.set('scaleX', 0.4);
		canvas.add(orange);
	}, {crossOrigin: 'anonymous'});
	
	// Add an apple.
	fabric.Image.fromURL('samples/apple.png', function(dummy) {
		apple = dummy;
		apple.set('selectable', false);
		apple.set('scaleY', 0.75);
		apple.set('scaleX', 0.75);
		canvas.setHeight(Math.max(apple.height, 500));
		canvas.setWidth(Math.max(apple.width, 500));
		canvas.add(apple);
		canvas.sendToBack(apple);
	}, {crossOrigin: 'anonymous'});
}

function button() {
	// Disable canvas selection.
	canvas.forEachObject(function(obj) {
		obj.selectable = false;
	});
	
	// Create a secondary canvas.
	boundingBox = orange.getBoundingRect();
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
	var indexMap = new Int32Array2D(canvasSec.height, canvasSec.width);
	// Iterate through each pixel.
	var count = 0,
		i = 0;
	for (var y = 0, lenY = orangeData.height; y < lenY; y++) {
		for (var x = 0, lenX = orangeData.width; x < lenX; x++, i += 4) {
			// If the current pixel is not fully opaque, its index = -1
			if (orangeData.data[i + 3] < 250) { 
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
				count++;
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
	
	// Build the matrix & solve the equations.
	var indexMapPlus = {
		data : indexMap,
		n : count
	};
	var solution = [];
	for (var channel = 0; channel < 3; channel++) {
		var equation = matrixBuilder(indexMapPlus, orangeData, appleData, channel);
		solution[channel] = conjGradSolver(equation.A, equation.b, equation.sol);
	}
	
	// Convert the solution into imageData.
	console.log(indexMap);
	console.log(canvasSec);
	ctxSec.clearRect(0, 0, canvasSec.width, canvasSec.height);
	var solutionData = ctxSec.getImageData(0, 0, canvasSec.width, canvasSec.height);
	var dataI = 0;
	for (var y = 0, lenY = canvasSec.height; y < lenY; y++) {
		for (var x = 0, lenX = canvasSec.width; x < lenX; x++, dataI += 4) {
			var solI = indexMap.get(x, y);
			if (solI < 0) { // If the current pixel is not included in the solution vector.
				// Use the background pixel color.
				for (var c = 0; c < 4; c++) {
					solutionData.data[dataI + c] = appleData.data[dataI + c];
				}
			} else { // Otherwise, use the color in the solution vector.
				for (var c = 0; c < 3; c++) {
					solutionData.data[dataI + c] = solution[c][solI];
				}
				solutionData.data[dataI + 3] = 255;
			}
		}
	}

	// Put the solution onto the main canvas.
	canvas.remove(orange);
	var ctx = canvas.getContext("2d");
	ctx.putImageData(solutionData, boundingBox.left, boundingBox.top);
	
	// Debugging: display the intermediate data.
	var debugDiv = document.getElementById("debug");
	while (debugDiv.firstChild) {
		debugDiv.removeChild(debugDiv.firstChild);
	}
	debugDiv.appendChild(orangeData.toCanvas());
	debugDiv.appendChild(indexMap.toCanvas());
	debugDiv.appendChild(appleData.toCanvas());
	debugDiv.appendChild(solutionData.toCanvas());
}

// This function sets up the matrix A and vector b of the linear equation.
// Matrix A has a unique encoding scheme to conserve memory.
function matrixBuilder(indexMapPlus, orangeData, appleData, colorChannel) {
	var indexMap = indexMapPlus.data,
		n = indexMapPlus.n;
	
	// Declare the matrix A, vector b, and the initial solution.
	var A = new Int32Array2D(5, n),
		b = [];
	for (var i = n; i--;) {
		b[i] = 0;
	}
	var initialSol = [];
	
	// For each pixel in the overlay.
	var dataI = colorChannel; // Index into the ImageData for pixel (x, y)
	for (var y = 0, lenY = orangeData.height; y < lenY; y++) {
		for (var x = 0, lenX = orangeData.width; x < lenX; x++, dataI += 4) {
			// Get the pixel's index.
			var pixIndex = indexMap.get(x, y);
			// Don't set an equation for irrelevant or boundary pixels.
			if (pixIndex < 0) {
				continue;
			}
			// Sets up a row of equation if it's an internal pixel.
			var dx = [0, 1, 0, -1],
				dy = [-1, 0, 1, 0],
				neiCount = 0,
				writeIndex = 0,
				pixColor = orangeData.data[dataI];
			for (var n = 0; n < 4; n++) { // For each neighbor (U, R, D, L).
				var neiX = x + dx[n];
				var neiY = y + dy[n];
				// Skip out-of-bound neighbors.
				if (!indexMap.inBound(neiX, neiY)) {
					continue;
				}
				// Process the in-bound neighbors.
				var neiIndex = indexMap.get(neiX, neiY),
					neiDataIndex = dataI + 4 * (dx[n] + lenX * dy[n]);
				// If the neighbor is a boundary pixel.
				if (neiIndex == -1) {
					b[pixIndex] += appleData.data[neiDataIndex];
					neiCount++;
					continue;
				}
				// Sets the row of A and add to the divergence.
				var neiColor = orangeData.data[neiDataIndex];
				neiCount++;
				writeIndex++;
				A.set(pixIndex, writeIndex, neiIndex);
				b[pixIndex] += neiColor - pixColor;
			}
			A.set(pixIndex, 0, neiCount);
			// Fill in the remaining spot of A with -1.
			for (var n = writeIndex + 1; n < 5; n++) {
				A.set(pixIndex, n, -1);
			}
			initialSol[pixIndex] = appleData.data[dataI];
		}
	}
	
	return {
		A : A,
		b : b,
		sol : initialSol
	};
}

function conjGradSolver(A, b, initialSol) {
	// Returns the dot product of two vectors: x, y.
	function dot(x, y) {
		if (x.length != y.length) {
			throw "dot: mismatched vector length.";
		}
		var sum = 0;
		for (var i = 0, lenI = x.length; i < lenI; i++) {
			sum += x[i] * y[i];
		}
		return sum;
	}
	
	// Returns the vector resulting from Matrix A multiplying with vector x.
	// Matrix A here refers specifically to the matrix created at matrixBuilder().
	function matrixAMult(x) {
		var sol = [];
		for (var i = 0, lenI = x.length; i < lenI; i++) {
			sol[i] = x[i] * A.get(i, 0);
			for (var j = 1; j < 5; j++) {
				var index = A.get(i, j);
				if (index == -1) break;
				sol[i] -= x[index];
			}
		}
		return sol;
	}
	
	// Initialize the solution.
	var sol = initialSol;
	
	// Start the first iteration.
	var count = 0,
		r = [];
		Ax = matrixAMult(initialSol);
	for (var i = 0, lenI = b.length; i < lenI; i++) {
		r[i] = b[i] - Ax[i];
	}
	var d = r.slice(),
		deltaNew = dot(r, r),
		deltaOld = deltaNew;

	// Conjugate gradient method iteration.
	while (count < 2500) {
		Ax = matrixAMult(d);
		var alpha = deltaNew / dot(d, Ax);
		for (var i = 0, lenI = sol.length; i < lenI; i++) {
			sol[i] += alpha * d[i];
		}

		// Recompute r every now and again to account for
		// floating point error.
		if (count % 100 == 0 && count > 0) {
			Ax = matrixAMult(sol);
			for (var i = 0, lenI = r.length; i < lenI; i++) {
				r[i] = b[i] - Ax[i];
			}
		} else { // Otherwise, just do quick update.
			for (var i = 0, lenI = r.length; i < lenI; i++) {
				r[i] -= alpha * Ax[i];
			}
		}

		deltaOld = deltaNew;
		deltaNew = dot(r, r);
		var beta = deltaNew / deltaOld;
		for (var i = 0, lenI = d.length; i < lenI; i++) {
			d[i] = r[i] + beta * d[i];
		}
		count++;
	}

	// Clamp the solution to be between 0 - 255.
	for (var i = sol.length; i >= 0; i--) {
		if (sol[i] > 255) {
			sol[i] = 255;
		} else if (sol[i] < 0) {
			sol[i] = 0;
		}
	}

	return sol;
}

// This class is used to represent 2D array of ints.
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
Int32Array2D.prototype.toCanvas = function () {
	var debugCanvas = fabric.util.createCanvasElement();
	debugCanvas.width = this.height;
	debugCanvas.height = this.width;
	var debugCtx = debugCanvas.getContext("2d");
	var debugData = debugCtx.getImageData(0, 0, debugCanvas.width, debugCanvas.height);
	
	var i = 0;
	for (var y = 0, lenY = debugCanvas.height; y < lenY; y++) {
		for (var x = 0, lenX = debugCanvas.width; x < lenX; x++, i += 4) {
			debugData.data[i + 3] = 255;
			var mapValue = this.get(x, y);
			if (mapValue >= 0) { // If internal pixels.
				debugData.data[i] = 255;
				debugData.data[i + 1] = 255;
				debugData.data[i + 2] = 255;
			} else if (mapValue == -1) { // If bordering pixels.
				debugData.data[i] = 255;
				debugData.data[i + 2] = 255;
			}
		}
	}
	debugCtx.putImageData(debugData, 0, 0);
	return debugCanvas;
}
Int32Array2D.prototype.logRow = function(row) {
	var str = "[";
	for (var i = 0; i < this.width; i++) {
		str += this.get(row, i);
		if (i != this.width - 1) {
			str += ", ";
		}
	}
	str += "]";
	console.log(str);
}

ImageData.prototype.toCanvas = function() {
	var canvas = fabric.util.createCanvasElement();
	canvas.height = this.height;
	canvas.width = this.width;
	var ctx = canvas.getContext("2d");
	ctx.putImageData(this, 0, 0);
	return canvas;
}