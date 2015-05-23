// A class that represents the main page.
function PageFilePrompt(mode, overlayData) {
	// The dialog box that prompts the user to select an overlay.
	var header = '1. Select an <b style="color:#FF9933">overlay image</b>.';
	if (mode === 'background') {
		header = '3. Select a <b style="color:#FF66CC">background image</b>.';
	}
	this.filedialog = fileDialogBox(header);

	// This method renders the page onto the screen.
	this.render = function() {
		// Present the content.
		$('#content').html(this.filedialog);

		// Event handler for clicking sample.
		var curr = this;
		$('#sample').click(function() {
			curr.clickSample();
		});

		// Event handler for clicking file upload.
		$('#upload').change(function(e){
			var reader = new FileReader();
			reader.onload = curr.uploadDone;
			reader.readAsDataURL(e.target.files[0]);
		});
	}

	// This method fires when the app finishes reading the file.
	this.uploadDone = function(e) {
		$('#filedialog').remove();
		if (mode === 'background') {
			srcToImageData(e.target.result, function(bgData){
				var nextPage = new PagePoisson(overlayData, bgData);
				nextPage.render();
			});
		} else {
			var nextPage = new PageOverlayEdit(e.target.result);
			nextPage.render();
		}
	}

	// This method fires when the user click select sample images.
	this.clickSample = function() {
		$('#filedialog').remove();
		if (mode === 'background') {
			var nextPage = new PageSampleImage(mode, overlayData);
		} else {
			var nextPage = new PageSampleImage();
		}
		nextPage.render();
	}
}

// This class is responsible for presenting sample images to the user.
function PageSampleImage(mode, overlayData) {
	this.sampleimagedialog = $.parseHTML('' +
		'<div id="sampledialog">' +
			'Click on one of the sample images below.' +
			'<div id="images">' +
				'<img class="simg" src="samples/orange.png" height="150">' +
				'<img class="simg" src="samples/apple.png" height="150">' +
				'<img class="simg" src="samples/watermelon.png" height="150">' +
				'<img class="simg" src="samples/cauli.png" height="150">' +
			'</div>' +
		'</div>');

	this.render = function() {
		// Present the content.
		$('#content').html(this.sampleimagedialog);

		// Configure the event handlers.
		var curr = this;
		$('#sampledialog img.simg').click(function(event){
			curr.imageSelect(event);
		});
	}

	// This method fires when the user clicks on one of the sample images.
	this.imageSelect = function(event) {
		$('#content').empty();
		var nextPage = 0;
		if (mode === 'background') {
			if (overlayData == undefined) {
				nextPage = new PageFilePrompt();
				nextPage.render();
			} else {
				srcToImageData(event.target.src, function(backgroundData) {
					nextPage = new PagePoisson(overlayData, backgroundData);
					nextPage.render();
				})
			}
		} else {
			nextPage = new PageOverlayEdit(event.target.src);
			nextPage.render();
		}
	}
}

function srcToImageData(imgSrc, callback) {
	var image = new Image();
	image.onload = getImageData;
	image.src = imgSrc;

	function getImageData() {
		var canvas = document.createElement('canvas');
		canvas.width = image.width;
		canvas.height = image.height;
		var ctx = canvas.getContext('2d');
		ctx.drawImage(image, 0, 0);
		var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
		callback(imgData);
	}
}

// This class is responsible for presenting the page that allows the users
// to crop out a region of their overlay image.
function PageOverlayEdit(overlaySrc) {
	this.contents = $.parseHTML(''+
		'<div>2. Draw a region using your mouse.</div>'
		);
	this.popup = $.parseHTML('' +
		'Are you sure about the selected region?<br>' +
		'<div class="small-btn yes-btn">Yes</div><div class="small-btn no-btn">No</div>'
		);
	this.myCanvas = document.createElement('canvas');
	this.overlayData = 0;
	this.uiBlocker = $('#block');

	this.render = function() {
		$('#content').html(this.contents);
		$('#content').append(this.myCanvas);
		srcToImageData(overlaySrc, this.renderCanvas);
	};

	// This method fires when the image is ready.
	var page = this;
	this.renderCanvas = function(imgData) {
		// Adjust the dimension of the canvas.
		page.myCanvas.width = imgData.width;
		page.myCanvas.height = imgData.height;

		// Put the image onto the canvas.
		var ctx = page.myCanvas.getContext('2d');
		ctx.putImageData(imgData, 0, 0);

		page.overlayData = imgData;
		page.bindCanvasEvent();
	};

	// This method contains the subroutine for binding event listeners to
	// the canvas to allow users to draw a region.
	this.bindCanvasEvent = function() {
		var ctx = this.myCanvas.getContext('2d');
		// Add event listeners to allow region selection.
		this.myCanvas.drawModule = {
			points: [],
			prevX: 0,
			prevY: 0,
			currX: 0,
			currY: 0,
			helddown: false};
		var canvas = this.myCanvas;
		var dm = this.myCanvas.drawModule;
		var page = this;
		dm.draw = function() {
			ctx.beginPath();
		    ctx.moveTo(dm.prevX, dm.prevY);
		    ctx.lineTo(dm.currX, dm.currY);
		    ctx.strokeStyle = 'black';
		    ctx.lineWidth = 1;
		    ctx.stroke();
		    ctx.closePath();
		};
		dm.mousedown = function(event) {
			if (event.offsetX === undefined || event.offsetY === undefined) {
				var canvasOffset = $(event.target).offset();
				event.offsetX = event.pageX - canvasOffset.left;
				event.offsetY = event.pageY - canvasOffset.top;
			}
			dm.helddown = true;
			dm.prevX = dm.currX;
			dm.prevY = dm.currY;
			dm.currX = event.offsetX;
			dm.currY = event.offsetY;
			dm.points.push([dm.currX, dm.currY]);
		};
		dm.mousemove = function(event) {
			if (dm.helddown) {
				if (event.offsetX === undefined || event.offsetY === undefined) {
					var canvasOffset = $(event.target).offset();
					event.offsetX = event.pageX - canvasOffset.left;
					event.offsetY = event.pageY - canvasOffset.top;
				}
				dm.prevX = dm.currX;
				dm.prevY = dm.currY;
				dm.currX = event.offsetX === undefined? event.layerX: event.offsetX;
				dm.currY = event.offsetY === undefined? event.layerY: event.offsetY;
				dm.points.push([dm.currX, dm.currY]);
				dm.draw();
			}
		};
		dm.mouseup = function(event) {
			if (dm.helddown) {
				dm.prevX = dm.currX;
				dm.prevY = dm.currY;
				dm.currX = dm.points[0][0];
				dm.currY = dm.points[0][1];
				dm.draw();
				dm.helddown = false;
			}
			canvas.removeEventListener('mousedown', dm.mousedown);
			canvas.removeEventListener('mousemove', dm.mousemove);
			canvas.removeEventListener('mouseup', dm.mouseup);
			// Blocks the screen with 'Processing, please wait...',
			// then let the worker performs polygon hit test.
			page.uiBlocker.fadeIn(300, function(){
				var worker = new Worker('scripts/point-contained.js');
				worker.addEventListener('message', function(e) {
					page.drawingDone(e.data);
				});
				worker.postMessage({
					width: page.myCanvas.width,
					height: page.myCanvas.height,
					points: dm.points
				});
			});
		};
		canvas.addEventListener('mousedown', dm.mousedown);
		canvas.addEventListener('mousemove', dm.mousemove);
		canvas.addEventListener('mouseup', dm.mouseup);
	};

	// This method executes when the worker finished with the polygon hit test.
	this.drawingDone = function(workerOutput) {
		// Retrieves the output from the worker.
		var points = workerOutput.points,
			xMin = workerOutput.xMin,
			xMax = workerOutput.xMax,
			yMin = workerOutput.yMin,
			yMax = workerOutput.yMax;

		// Redraw the main canvas to remove the drawn region.
		var ctx = this.myCanvas.getContext('2d');
		ctx.putImageData(this.overlayData, 0, 0);
		var imgData = ctx.getImageData(0, 0, this.myCanvas.width, this.myCanvas.height);
		for (var i = 3, lenI = imgData.data.length; i < lenI; i += 4) {
			imgData.data[i] = 0;
		}
		for (var i = 0, lenI = points.length; i < lenI; i++) {
			var x = points[i][0];
			var y = points[i][1];
			var index = (y * imgData.width + x) * 4 + 3;
			imgData.data[index] = 255;
		}
		ctx.putImageData(imgData, 0, 0);
		var croppedData = ctx.getImageData(xMin, yMin, xMax-xMin + 1, yMax-yMin + 1);
		this.uiBlocker.hide();

		// Setup for the user prompt.
		$('#popup').html(this.popup);
		var page = this;
		// Event handler for when the user select yes.
		$('#popup div.yes-btn').click(function() {
			$('#popup').animate({
				bottom: -$('#popup').outerHeight()
			}, function(){
				$('#popup').hide();
				page.overlayData = croppedData;
				page.userAccept();
			})
		});
		// Event handler for when the user select no.
		$('#popup div.no-btn').click(function() {
			$('#popup').animate({
				bottom: -$('#popup').outerHeight()
			}, function(){
				$('#popup').hide();
				page.userReject();
			})
		});

		// Reveal the prompt after all of the setup is done.
		$('#popup').show().css({bottom: -$('#popup').outerHeight()}).animate({bottom: 0});
	}

	this.userAccept = function() {
		$('#content').empty();
		$('#popup').empty();
		var nextPage = new PageFilePrompt('background', this.overlayData);
		nextPage.render();
	}

	this.userReject = function() {
		$('#content').empty();
		$('#popup').empty();
		var nextPage = new PageOverlayEdit(overlaySrc);
		nextPage.render();
	}
}

// Creates a DOM object representing the fileDialogBox
function fileDialogBox(header) {
	return $.parseHTML('<div id="filedialog">' +
		header + '<br>' +
		'<div class="btn"><input type="file" id="upload">Use your own image</div>' + 
		'-OR-<br>' + 
		'<div class="btn" id="sample">Select from sample images</div>' +
		'</div>');
}
