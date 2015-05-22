// Check for browser support of various features.
function() {
	var allWork = true;

	// Webworker support.
	if (typeof(Worker) === "undefined") {
		allWork = false;
	}
}