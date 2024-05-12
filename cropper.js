(function (cropper, undefined) {
	"use strict"; // помогает нам обнаруживать иначе сложные ошибки

	/* ВЫВОД */
	var canvas;
	var context;

	var image;
	var restoreImage;
	var currentDimens = {};
	var cropping = false;

	var colors = {
		white: "#ffffff",
		black: "#000000",
		overlay: "rgba(0, 0, 0, 0.6)"
	};

	var overlay;
	var rotation = 0; // Текущий угол поворота в градусах
	var rotationStep = 90; // Шаг поворота (в градусах)

	function draw() {
		// очистить холст
		context.clearRect(0, 0, canvas.width, canvas.height);

		// если у нас нет файла изображения, прервать вывод на этом этапе
		if (image === undefined) {
			return;
		}

		// нарисовать изображение
		var dimens = currentDimens;

		// Сохраняем текущее состояние canvas
		context.save();

		// Переносим точку отсчета в центр canvas
		context.translate(canvas.width / 2, canvas.height / 2);

		// Вращаем canvas вокруг его центра
		context.rotate(rotation * Math.PI / 180);

		// Рисуем изображение с учетом вращения
		context.drawImage(image, -dimens.width / 2, -dimens.height / 2, dimens.width, dimens.height);

		// Восстанавливаем исходное состояние canvas
		context.restore();

		// нарисовать элементы обрезки, если мы обрезаем
		if (cropping) {
			// нарисовать оверлей
			drawOverlay();

			// нарисовать изменение размера
			var x = overlay.x + overlay.width - 5,
				y = overlay.y + overlay.height - 5,
				w = overlay.resizerSide,
				h = overlay.resizerSide;

			context.save();
			context.fillStyle = colors.black;
			context.strokeStyle = colors.white;
			context.fillRect(x, y, w, h);
			context.strokeRect(x, y, w, h);
			context.restore();
		}
	}

	function drawOverlay() {
		// нарисовать оверлей, используя путь из 4 трапеций
		context.save();

		context.fillStyle = colors.overlay;
		context.beginPath();

		context.moveTo(0, 0);
		context.lineTo(overlay.x, overlay.y);
		context.lineTo(overlay.x + overlay.width, overlay.y);
		context.lineTo(canvas.width, 0);

		context.moveTo(canvas.width, 0);
		context.lineTo(overlay.x + overlay.width, overlay.y);
		context.lineTo(overlay.x + overlay.width, overlay.y + overlay.height);
		context.lineTo(canvas.width, canvas.height);

		context.moveTo(canvas.width, canvas.height);
		context.lineTo(overlay.x + overlay.width, overlay.y + overlay.height);
		context.lineTo(overlay.x, overlay.y + overlay.height);
		context.lineTo(0, canvas.height);

		context.moveTo(0, canvas.height);
		context.lineTo(overlay.x, overlay.y + overlay.height);
		context.lineTo(overlay.x, overlay.y);
		context.lineTo(0, 0);

		context.fill();

		context.restore();
	}

	function setRatio(ratio) {
		overlay.ratioXY = ratio;
		overlay.height = Math.floor(overlay.width * ratio);
	}

	function getScaledImageDimensions(width, height) {
		// выбираем размер для масштабирования, в зависимости от того, что "больше"
		var factor = 1;
		if ((canvas.width - width) < (canvas.height - height)) {
			// масштабировать по ширине
			factor = canvas.width / width;
		} else {
			// масштабировать по высоте
			factor = canvas.height / height;
		}
		// важный "if, else", а не "if, if", иначе изображения 1:1 не масштабируются

		var dimens = {
			width: Math.floor(width * factor),
			height: Math.floor(height * factor),
			factor: factor
		};

		return dimens;
	}

	function getTouchPos(touchEvent) {
		var rect = canvas.getBoundingClientRect();

		return {
			x: touchEvent.touches[0].clientX - rect.left,
			y: touchEvent.touches[0].clientY - rect.top
		};
	}
	/**
	 * @param {Number} x позиция мыши / касания клиентского события
	 * @param {Number} y позиция мыши / касания клиентского события
	 */
	function getClickPos({ x, y }) {
		return {
			x: x - window.scrollX,
			y: y - window.scrollY
		};
	}

	function isInOverlay(x, y) {
		return x > overlay.x && x < (overlay.x + overlay.width) && y > overlay.y && y < (overlay.y + overlay.height);
	}

	function isInHandle(x, y) {
		return x > (overlay.x + overlay.width - overlay.resizerSide) && x < (overlay.x + overlay.width + overlay.resizerSide) && y > (overlay.y + overlay.height - overlay.resizerSide) && y < (overlay.y + overlay.height + overlay.resizerSide);
	}

	/* СЛУШАТЕЛИ СОБЫТИЙ */
	var drag = {
		type: "", // опции: "moveOverlay", "resizeOverlay"
		inProgress: false,
		originalOverlayX: 0,
		originalOverlayY: 0,
		originalX: 0,
		originalY: 0,
		originalOverlayWidth: 0,
		originalOverlayHeight: 0
	};

	/**
	 * @param {Number} x позиция мыши / касания клиентского события
	 * @param {Number} y позиция мыши / касания клиентского события
	 */
	function initialCropOrMoveEvent({ x, y }) {
		// если мышь нажата в области оверлея
		if (isInOverlay(x, y)) {
			drag.type = "moveOverlay";
			drag.inProgress = true;
			drag.originalOverlayX = x - overlay.x;
			drag.originalOverlayY = y - overlay.y;
		}

		if (isInHandle(x, y)) {
			drag.type = "resizeOverlay";
			drag.inProgress = true;
			drag.originalX = x;
			drag.originalY = y;
			drag.originalOverlayWidth = overlay.width;
			drag.originalOverlayHeight = overlay.height;
		}
	}

	/**
	 * @param {Number} x горизонтальная позиция мыши / касания клиентского события
	 * @param {Number} y вертикальная позиция мыши / касания клиентского события
	 * @description
	**/

	function startCropOrMoveEvent({ x, y }) {
		// Установить текущий курсор по необходимости
		if (isInHandle(x, y) || (drag.inProgress && drag.type === "resizeOverlay")) {
			canvas.style.cursor = 'nwse-resize';
		} else if (isInOverlay(x, y)) {
			canvas.style.cursor = 'move';
		} else {
			canvas.style.cursor = 'auto';
		}

		// прерываем, если нет перетаскивания в процессе
		if (!drag.inProgress) {
			return;
		}

		// проверяем, какой тип перетаскивания делать
		if (drag.type === "moveOverlay") {
			overlay.x = x - drag.originalOverlayX;
			overlay.y = y - drag.originalOverlayY;

			// Ограничить размер холста.
			var xMax = canvas.width - overlay.width;
			var yMax = canvas.height - overlay.height;

			if (overlay.x < 0) {
				overlay.x = 0;
			} else if (overlay.x > xMax) {
				overlay.x = xMax;
			}

			if (overlay.y < 0) {
				overlay.y = 0;
			} else if (overlay.y > yMax) {
				overlay.y = yMax;
			}

			draw();
		} else if (drag.type === "resizeOverlay") {
			overlay.width = drag.originalOverlayWidth + (x - drag.originalX);

			// не разрешать уменьшение оверлея до слишком малых размеров
			if (overlay.width < 10) {
				overlay.width = 10;
			}

			// Не позволяйте выходить за границы обрезки
			if (overlay.x + overlay.width > canvas.width) {
				overlay.width = canvas.width - overlay.x;
			}

			overlay.height = overlay.width * overlay.ratioXY;

			if (overlay.y + overlay.height > canvas.height) {
				overlay.height = canvas.height - overlay.y;
				overlay.width = overlay.height / overlay.ratioXY;
			}

			draw();
		}
	}

	function addEventListeners() {
		// добавить слушателей событий мыши к холсту
		canvas.onmousedown = function (event) {
			// в зависимости от того, где щелкнула мышь, выбираем тип события, которое нужно вызвать
			var coords = canvas.getMouseCoords(event);
			initialCropOrMoveEvent(getClickPos(coords));
		};

		canvas.onmouseup = function (event) {
			// отменить любые перетаскивания
			drag.inProgress = false;
		};

		canvas.onmouseout = function (event) {
			// отменить любые перетаскивания
			drag.inProgress = false;
		};

		canvas.onmousemove = function (event) {
			var coords = canvas.getMouseCoords(event);

			startCropOrMoveEvent(getClickPos(coords));
		};

		canvas.addEventListener('touchstart', event => {
			initialCropOrMoveEvent(getTouchPos(event));
		});

		canvas.addEventListener('touchmove', event => {
			startCropOrMoveEvent(getTouchPos(event));
		});

		canvas.addEventListener('touchend', event => {
			drag.inProgress = false;
		})
	}

	function getEmptySpaceDimensions() {
		var emptyWidth = canvas.width - currentDimens.width;
		var emptyHeight = canvas.height - currentDimens.height;
		return {
			width: emptyWidth,
			height: emptyHeight
		};
	}

	/* ФУНКЦИИ ОБРЕЗКИ */
	function cropImage(entire) {
		// если у нас нет файла изображения, прервать на этом этапе
		if (image === undefined) {
			return false;
		}

		// если мы не обрезаем, убедимся, что entire === true
		if (!cropping) {
			entire = true;
		}

		// предполагаем, что мы хотим обрезать весь снимок, это будет переопределено ниже
		var x = 0;
		var y = 0;
		var width = image.width;
		var height = image.height;

		if (!entire) {
			// вычисляем фактические размеры для обрезки
			var factor = currentDimens.factor;
			var emptySpace = getEmptySpaceDimensions();
			var x = Math.floor((overlay.x - emptySpace.width / 2) / factor);
			var y = Math.floor((overlay.y - emptySpace.height / 2) / factor);
			var width = Math.floor(overlay.width / factor);
			var height = Math.floor(overlay.height / factor);

			// проверяем, что значения находятся в пределах изображения
			if (x < 0) {
				x = 0;
			}
			if (x > image.width) {
				x = image.width;
			}
			if (y < 0) {
				y = 0;
			}
			if (y > image.height) {
				y = image.height;
			}

			if (x + width > image.width) {
				width = image.width - x;
			}
			if (y + height > image.height) {
				height = image.height - y;
			}
		}

		// загружаем изображение на холст обрезки
		var cropCanvas = document.createElement("canvas");
		cropCanvas.setAttribute("width", width);
		cropCanvas.setAttribute("height", height);

		var cropContext = cropCanvas.getContext("2d");
		cropContext.drawImage(image, x, y, width, height, 0, 0, width, height);

		return cropCanvas;
	}

	/* функция взята из http://stackoverflow.com/a/7261048/425197 */
	function dataUrlToBlob(dataURI) {
		// преобразовать base64 в двоичные данные, хранящиеся в строке
		var byteString = atob(dataURI.split(',')[1]);

		// разделить компонент mime
		var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];

		// записать байты строки в ArrayBuffer
		var ab = new ArrayBuffer(byteString.length);
		var ia = new Uint8Array(ab);
		for (var i = 0; i < byteString.length; i++) {
			ia[i] = byteString.charCodeAt(i);
		}

		// записать ArrayBuffer в blob и вернуть его
		return new Blob([ia], { type: mimeString });
	}

	/* API ФУНКЦИИ */
	cropper.showImage = function (src) {
		cropping = false;
		image = new Image();
		image.onload = function () {
			currentDimens = getScaledImageDimensions(image.width, image.height); // вычисляем масштаб
			draw();
		};
		image.src = src;
	};

	cropper.startCropping = function () {
		// продолжать только в случае загруженного изображения
		if (image === undefined) {
			return false;
		}

		// сохраняем текущее состояние
		restoreImage = new Image();
		restoreImage.src = image.src;

		cropping = true;
		draw();

		return true;
	};

	cropper.getCroppedImageSrc = function () {
		if (image) {
			// возвращаем обрезанное изображение
			var cropCanvas = cropImage(!cropping); // cropping здесь управляет получением всего изображения или нет, что желательно, если пользователь не обрезает
			var url = cropCanvas.toDataURL("png");

			// показываем новое изображение, только если его еще нет, то есть если мы обрезаем
			if (cropping) {
				cropper.showImage(url);
			}

			cropping = false;
			return url;
		} else {
			return false;
		}
	};

	cropper.getCroppedImageBlob = function (type) {
		if (image) {
			// возвращаем обрезанное изображение
			var cropCanvas = cropImage(!cropping); // cropping здесь управляет получением всего изображения или нет, что желательно, если пользователь не обрезает
			var url = cropCanvas.toDataURL(type || "png");

			// показываем новое изображение, только если его еще нет, то есть если мы обрезаем
			if (cropping) {
				cropper.showImage(url);
			}

			cropping = false;

			// преобразовать url в blob и вернуть его
			return dataUrlToBlob(url);
		} else {
			return false;
		}
	};

	cropper.start = function (newCanvas, ratio) {
		// получаем контекст из данного холста
		canvas = newCanvas;
		if (!canvas.getContext) {
			return; // отказываемся
		}
		context = canvas.getContext("2d");

		// Установить позицию оверлея по умолчанию
		overlay = {
			x: 50,
			y: 50,
			width: 100,
			height: 100,
			resizerSide: 10,
			ratioXY: 1
		}

		// установить соотношение оверлея
		if (ratio) {
			setRatio(ratio);
		}

		// настроить мышь
		addEventListeners();
	};

	cropper.restore = function () {
		if (restoreImage === undefined) {
			return false;
		}

		cropping = false;

		// показать сохраненное изображение
		cropper.showImage(restoreImage.src);
		return true;
	};

	// Функции для вращения изображения
	cropper.rotateLeft = function () {
		rotation = (rotation - rotationStep + 360) % 360;
		draw();
	};

	cropper.rotateRight = function () {
		rotation = (rotation + rotationStep) % 360;
		draw();
	};

	/* изменить прототип холста, чтобы мы могли получить x и y координаты мыши */
	HTMLCanvasElement.prototype.getMouseCoords = function (event) {
		// пройтись по этому элементу и всем его родителям, чтобы получить общий сдвиг
		var totalOffsetX = 0;
		var totalOffsetY = 0;
		var canvasX = 0;
		var canvasY = 0;
		var currentElement = this;

		do {
			totalOffsetX += currentElement.offsetLeft;
			totalOffsetY += currentElement.offsetTop;
		}
		while (currentElement = currentElement.offsetParent)

		canvasX = event.pageX - totalOffsetX;
		canvasY = event.pageY - totalOffsetY;

		return { x: canvasX, y: canvasY }
	}

	// Добавляем обработчики событий для Drag and Drop
	canvas.addEventListener('dragover', handleDragOver, false);
	canvas.addEventListener('dragleave', handleDragLeave, false);
	canvas.addEventListener('drop', handleFileDrop, false);

	function handleDragOver(evt) {
		evt.stopPropagation();
		evt.preventDefault();
		evt.dataTransfer.dropEffect = 'copy'; // указываем браузеру, что разрешено перетаскивание
		canvas.style.borderColor = "#000000";
	}

	function handleDragLeave(evt) {
		evt.stopPropagation();
		evt.preventDefault();
		canvas.style.borderColor = "#8f8f8f";
	}

	function handleFileDrop(evt) {
		evt.stopPropagation();
		evt.preventDefault();
		canvas.style.borderColor = "#8f8f8f";
		var files = evt.dataTransfer.files; // FileList object.

		// файлы приняты, начнем обработку
		if (files.length > 0) {
			var file = files[0];
			var reader = new FileReader();

			// событие возникает, когда чтение файла завершено
			reader.onload = function (event) {
				cropper.showImage(event.target.result);
			};

			// начинаем чтение файла
			reader.readAsDataURL(file);
		}
	}

	/* Приватные функции */
	// Получить x и y координаты касания
	function getTouchPos(touchEvent) {
		var rect = canvas.getBoundingClientRect();
		return {
			x: touchEvent.touches[0].clientX - rect.left,
			y: touchEvent.touches[0].clientY - rect.top
		};
	}
}(window.cropper = window.cropper || {}));

// Добавляем обработчики событий для Drag and Drop
canvas.addEventListener('dragover', handleDragOver, false);
canvas.addEventListener('dragleave', handleDragLeave, false);
canvas.addEventListener('drop', handleFileDrop, false);

function handleDragOver(evt) {
	evt.stopPropagation();
	evt.preventDefault();
	evt.dataTransfer.dropEffect = 'copy';
}

function handleDragLeave(evt) {
	evt.stopPropagation();
	evt.preventDefault();
}

function handleFileDrop(evt) {
	evt.stopPropagation();
	evt.preventDefault();

	const files = evt.dataTransfer.files;
	if (files.length > 0) {
		const file = files[0];
		const reader = new FileReader();
		reader.onload = function (event) {
			const data = event.target.result;
			cropper.showImage(data);
		};
		reader.readAsDataURL(file);
	}
}