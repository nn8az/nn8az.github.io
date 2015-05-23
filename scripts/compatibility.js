
$(document).ready(function() {
	// Check for browser support of various features.
	var allWork = true;

	// Webworker support.
	if (typeof(Worker) === "undefined") {
		allWork = false;
	}

	if (allWork) {
		var nextPage = new PageFilePrompt();
		nextPage.render();
	} else {
		$('#content').append('<h1>Sorry!</h1><p>This web application is not supported by your browser :-(</p>')
	}
});