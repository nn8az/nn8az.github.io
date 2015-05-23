self.addEventListener('message', function(e) {
	var input = e.data;
	var A = new Int32Array2D;
	A.width = input.A.width;
	A.height = input.A.height;
	A.data = input.A.data;
	sorSolver(A, input.b, input.omega, input.initialSol, input.color);
});

function sorSolver(A, b, omega, initialSol, color) {
	var count = 0,
		maxDelta = 0;
	while (count < 1000) {
		// Every 10 iterations, we check to see the biggest change made to
		// the solution vector.  If the change isn't significant, the loop
		// stops.
		if (count % 10 == 0) maxDelta = 0;

		for (var i = 0, lenI = b.length; i < lenI; i++) {
			var sigma = 0;
			// Sigma += dot product of ith row of A and initialSolution vector
			for (var j = 1; j < 5; j++) {
				var entryA = A.get(i, j);
				if (entryA == -1) break;
				sigma -= initialSol[entryA];
			}
			var delta = omega * ((b[i] - sigma) / A.get(i, 0) - initialSol[i]);
			var posDelta = Math.abs(delta);
			initialSol[i] += delta;
			if (count % 10 == 0 && posDelta > maxDelta) maxDelta = posDelta;
		}

		if (count % 10 == 0 && maxDelta < 10) break;

		count++;
	}
	
	self.postMessage({
		sol: initialSol,
		c: color
	});
	self.close();
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