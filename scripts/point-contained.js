self.addEventListener('message', function(e) {
	var input = e.data;
	inRegionPoints(input.width, input.height, input.points);
});

// This function outputs all of the coordinates that
// are contained in the polygon region.
function inRegionPoints(width, height, points) {
	// This algorithm works in multiple trials. Each trial uniformly
	// samples points on the canvas and perform polygon hittest on them.
	// Earlier trials have larger spacing between samples. The next trial's
	// sampling region falls within the upper and lower bound determined by
	// the trial that came before it.
	var tParam = [false, false];
	tParam[0] = {
		yStart: 0,
		xStart: 0,
		yStop: height,
		xStop: width,
		inc: 10
	};
	tParam[1] = {
		inc: 1,
	}

	var output = {};
	output.points = [];
	for (var t = 0; t < tParam.length; t++) {
		console.log(tParam[t]);
		// Keep track of min-max statistics.
		var xMin = width, xMax = 0,
			yMin = height, yMax = 0;

		// Loop through the canvas.
		for (var y = tParam[t].yStart, lenY = tParam[t].yStop, inc = tParam[t].inc; y < lenY; y += inc) {
			for (var x = tParam[t].xStart, lenX = tParam[t].xStop; x < lenX; x += inc) {
				// For each point, perform the polygon hit test.
				var hit = false;
				for (var noPoint = points.length, i = 0, j = noPoint - 1; i < noPoint; j = i++) {
					if (
						((points[i][1] > y) != (points[j][1] > y)) &&
						(x < (points[j][0] - points[i][0]) * (y - points[i][1]) / (points[j][1] - points[i][1]) + points[i][0])
					)  hit = !hit;
				}

				if (hit) {
					// Update min-max statistics.
					if (x < xMin) xMin = x;
					if (y < yMin) yMin = y;
					if (x > xMax) xMax = x;
					if (y > yMax) yMax = y;

					// Record the point if it's the last trial.
					if (t == tParam.length - 1) {
						output.points.push([x, y]);
					}
				}
			}
		}

		console.log(xMin, xMax, yMin, yMax);

		// Use the min-max statistics of the current trial to determine
		// the upper and lower bound for the next trial.
		if (t < tParam.length - 1) {
			var nextTrial = tParam[t + 1];
			nextTrial.yStart = Math.max(yMin - inc + 1, 0);
			nextTrial.xStart = Math.max(xMin - inc + 1, 0);
			nextTrial.yStop = Math.min(yMax + inc, height);
			nextTrial.xStop = Math.min(xMax + inc, width);
		} else {
			output.xMin = xMin;
			output.xMax = xMax;
			output.yMin = yMin;
			output.yMax = yMax;
		}
	}
	self.postMessage(output);
	self.close();
}