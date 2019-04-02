
	// patch WebGL PIXI.mesh.MeshRenderer
	var _pixiGlCore2 = PIXI.glCore;
	PIXI.mesh.MeshRenderer.prototype.onContextChange = function onContextChange() {
		var gl = this.renderer.gl;

		this.shader = new PIXI.Shader(gl, 'attribute vec2 aVertexPosition;\n\nuniform mat3 projectionMatrix;\nuniform mat3 translationMatrix;\n\nvoid main(void)\n{\n    gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);\n}\n', 'uniform vec4 uColor;\n\nvoid main(void)\n{\n    gl_FragColor = uColor;\n}\n');
	};

	PIXI.mesh.MeshRenderer.prototype.render = function render(mesh) {
		var renderer = this.renderer;
		var gl = renderer.gl;
		var glData = mesh._glDatas[renderer.CONTEXT_UID];

		if (!glData) {
			renderer.bindVao(null);

			glData = {
				shader: this.shader,
				vertexBuffer: _pixiGlCore2.GLBuffer.createVertexBuffer(gl, mesh.vertices, gl.STREAM_DRAW),
				indexBuffer: _pixiGlCore2.GLBuffer.createIndexBuffer(gl, mesh.indices, gl.STATIC_DRAW)
			};

			// build the vao object that will render..
			glData.vao = new _pixiGlCore2.VertexArrayObject(gl)
				.addIndex(glData.indexBuffer)
				.addAttribute(glData.vertexBuffer, glData.shader.attributes.aVertexPosition, gl.FLOAT, false, 2 * 4, 0);

			mesh._glDatas[renderer.CONTEXT_UID] = glData;
		}

		renderer.bindVao(glData.vao);

		renderer.bindShader(glData.shader);

		glData.shader.uniforms.translationMatrix = mesh.worldTransform.toArray(true);

		glData.shader.uniforms.uColor = PIXI.utils.premultiplyRgba(mesh.tintRgb, mesh.worldAlpha, glData.shader.uniforms.uColor);

		glData.vao.draw(gl.TRIANGLE_STRIP, mesh.indices.length, 0);
	};
	function getJSON(url, successHandler, errorHandler) {
		var xhr = typeof XMLHttpRequest != 'undefined'
			? new XMLHttpRequest()
			: new ActiveXObject('Microsoft.XMLHTTP');
		xhr.open('get', url, true);
		xhr.onreadystatechange = function() {
			var status;
			var data;
			if (xhr.readyState == 4) {
				status = xhr.status;
				if (status == 200) {
					data = JSON.parse(xhr.responseText);
					successHandler && successHandler(data);
				} else {
					errorHandler && errorHandler(status);
				}
			}
		};
		xhr.send();
	}

	document.addEventListener("DOMContentLoaded", function() {
		getJSON('newElectionData.json', function(topo) {
			// var mainLegend = document.querySelector('.main-legend');
			// var API_URL = '//api-adresse.data.gouv.fr';
			// var SHORT_CITY_NAMES = ['y', 'ay', 'bu', 'by', 'eu', 'fa', 'gy', 'oo', 'oz', 'py', 'ri', 'ry', 'sy', 'ur', 'us', 'uz'];
			var map = L.map('map').setView([46.953387, 2.892341], 6);
			// var hash = new L.Hash(map);


    L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw', {
        maxZoom: 18,
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, ' +
        '<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
        'Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
        id: 'mapbox.light'
    }).addTo(map);



			map.attributionControl.setPosition('bottomleft');
			map.zoomControl.setPosition('bottomright');


			let zelenskiColor = "0x4e9a69";
			let poroshenkoColor = "0x790a4f";
			let closeResultColor = "0x4D7794";
			let emptyColor = "0x000";

			// L.control.legend = function(opts) {
			// 	return new L.Control.Legend(opts);
			// }

			// L.control.legend({ position: 'bottomright' }).addTo(map);

			// var legend = document.querySelector('div.legend.geometry');
			// var legendContent = legend.querySelector('.content');
			var pixiLayer = (function() {
				var firstDraw = true;
				var prevZoom;
				var colorScale = d3.scaleLinear()
					.domain([0, 50, 100])
					.range(["#c6233c", "#ffd300", "#008000"]);
				var meshAlphaScale = d3.scaleLinear()
					.domain([9, 12])
					.range([0.6, 1]);
				meshAlphaScale.clamp(true);
				var pixiContainer = new PIXI.Graphics();
				pixiContainer.alpha = 0.8;
				var colorScaleTour2 = d3.scaleLinear()
						.domain([0, 0.499, 0.501, 1])
						.range(["#000000", "#83726D", "#ffee00", "#fc9300"]);
				var panneau2color = {
					'0': 0xffffff,
					'1': 0xfed002,
					'2': 0x83726d
				};
				var panneau2candidate = {
					'1': 'M. Emmanuel MACRON',
					'2': 'Mme Marine LE PEN'
				};
				var tree = rbush();
				function containsPoint(polygon, p) {
					var inside = false,
						part, p1, p2, i, j, k, len, len2;
					// ray casting algorithm for detecting if point is in polygon
					for (i = 0, len = polygon.length; i < len; i++) {
						part = polygon[i];

						for (j = 0, len2 = part.length, k = len2 - 1; j < len2; k = j++) {
							p1 = part[j];
							p2 = part[k];

							if (((p1[1] > p.y) !== (p2[1] > p.y)) && (p.x < (p2[0] - p1[0]) * (p.y - p1[1]) / (p2[1] - p1[1]) + p1[0])) {
								inside = !inside;
							}
						}
					}
					return inside;
				}
				var focus = null;
				// var barbiche = Barbiche();
				var doubleBuffering = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
				var mesh;
				return L.pixiOverlay(function(utils) {
					var zoom = utils.getMap().getZoom();
					var container = utils.getContainer();
					var renderer = utils.getRenderer();
					var gl = renderer.gl;
					var project = utils.latLngToLayerPoint;
					var scale = utils.getScale();
					var invScale = 1 / scale;
					var self = this;
					if (firstDraw) {
						(function() {
							// if (renderer.type === PIXI.RENDERER_TYPE.WEBGL) {
							// 	gl.blendFunc(gl.ONE, gl.ZERO);
							// 	// document.querySelector('#webgl').style.display = 'block';
							// } else {
							// 	// document.body.removeChild(document.querySelector('#webgl'));
							// }
							topo.arcs.forEach(function(arc) {
								arc.forEach(function(position) {
									var proj = project([position[1], position[0]]);
									position[0] = proj.x;
									position[1] = proj.y;
								});
							});
							var geojson = topojson.feature(topo, topo.objects["-"]);
							var interiors = topojson.mesh(topo, topo.objects["-"], function(a, b) { return a !== b; });
							topo = null;

							prevZoom = zoom;
							function drawPoly(color) {
								return function(poly) {
									var shape = new PIXI.Polygon(poly[0].map(function(point) {
										return new PIXI.Point(point[0], point[1]);
									}));
									container.beginFill(color, 0.5);
									container.drawShape(shape);
									if (poly.length > 1) {
										for (var i = 1; i < poly.length; i++) {
											var hole = new PIXI.Polygon(poly[i].map(function(point) {
												return new PIXI.Point(point[0], point[1]);
											}));
											container.drawShape(hole);
											container.addHole();
										}
									}
								};
							}
							geojson.features.forEach(function(feature, index) {
								// here
								let zelenski = feature.properties.z / feature.properties.v9 * 100
								let poroshenko = feature.properties.p / feature.properties.v9 * 100					
								let diff = zelenski - poroshenko
					
								let color;
					
					
								// if difference between P and Z is small
								if (Math.abs(diff) < 10) {				
									color = closeResultColor;				
								}
								// if difference between P and Z is bigger than 10%
								else {
									// if Z has more votes
									if (diff > 0) {
										color = zelenskiColor;
									}
									// if P has more votes
									else {
										color = poroshenkoColor;				
									}
								}								

								var bounds;
								if (feature.geometry.type === 'Polygon') {
									bounds = L.bounds(feature.geometry.coordinates[0]);
									drawPoly(color)(feature.geometry.coordinates);
								} else if (feature.geometry.type == 'MultiPolygon') {
									feature.geometry.coordinates.forEach(drawPoly(color));
									feature.geometry.coordinates.forEach(function(poly, index) {
										if (index === 0) bounds = L.bounds(poly[0]);
										else {
											poly[0].forEach(function(point) {
												bounds.extend(point);
											});
										}
									});
								}
								tree.insert({
									minX: bounds.min.x,
									minY: bounds.min.y,
									maxX: bounds.max.x,
									maxY: bounds.max.y,
									feature: feature
								});
							});
							geojson = null;

							// if (renderer.type === PIXI.RENDERER_TYPE.WEBGL) {
							// 	(function() {
							// 		mesh = new PIXI.Container();
							// 		var point2index = {};
							// 		var vertices = [];
							// 		var edges = [];
							// 		interiors.coordinates.forEach(function(arc) {
							// 			arc.forEach(function(point, index) {
							// 				var key = point[0] + '#' + point[1];
							// 				var indexTo;
							// 				if (!(key in point2index)) {
							// 					indexTo = point2index[key] = vertices.length;
							// 					vertices.push(point);
							// 				} else {
							// 					indexTo = point2index[key];
							// 				}
							// 				if (index > 0) {
							// 					var prevPoint = arc[index - 1];
							// 					var indexFrom = point2index[prevPoint[0] + '#' + prevPoint[1]];
							// 					if (indexFrom !== indexTo) edges.push([indexTo, indexFrom]);
							// 				}
							// 			})
							// 		});
							// 		var memo = Object.create(null);
							// 		var newIndex = 0;
							// 		var meshVertices = [];
							// 		var meshIndices = [];
							// 		var iMax, iMin;
							// 		function meshCreate(meshVertices, meshIndices) {
							// 			var partialMesh = new PIXI.mesh.Mesh(null, new Float32Array(meshVertices), null, new Uint16Array(meshIndices));
							// 			partialMesh.tint = 0x0;
							// 			mesh.addChild(partialMesh);
							// 		}
							// 		function cb(polygon) {
							// 			if (newIndex > 60000) {
							// 				memo = Object.create(null);
							// 				meshCreate(meshVertices, meshIndices);
							// 				newIndex = 0;
							// 				meshVertices = [];
							// 				meshIndices = [];
							// 			}
							// 			var indices = polygon.map(function(point) {
							// 				var key = point[0] + '#' + point[1];
							// 				var index = memo[key];
							// 				if (index !== undefined) return index;
							// 				else {
							// 					var index = memo[key] = newIndex++;
							// 					meshVertices.push(point[0], point[1]);
							// 					return index;
							// 				}
							// 			});
							// 			iMax = polygon.length - 1;
							// 			iMin = 0;
							// 			meshIndices.push(indices[iMax]);
							// 			while(iMax - iMin >= 2) {
							// 				meshIndices.push(indices[iMax--], indices[iMin++]);
							// 			}
							// 			if (iMax === iMin) {
							// 				meshIndices.push(indices[iMax], indices[iMax]);
							// 			} else meshIndices.push(indices[iMax], indices[iMin], indices[iMin]);
							// 		}


							// 		graphDraw({vertices: vertices, edges: edges}, 2 / utils.getScale(12), cb, Math.PI);
							// 		meshCreate(meshVertices, meshIndices);
							// 	})();
							// } else {
							// 	mesh = new PIXI.Graphics();
							// 	mesh.lineStyle(2 / utils.getScale(12), 0x0, 1);
							// 	interiors.coordinates.forEach(function(path) {
							// 		path.forEach(function(point, index) {
							// 			if (index === 0) mesh.moveTo(point[0], point[1]);
							// 			else mesh.lineTo(point[0], point[1]);
							// 		});
							// 	});
							// }
							interiors = null;
							// container.addChild(mesh);

							// function findFeature(latlng) {
							// 	var point = project(latlng);
							// 	var features = tree.search({
							// 		minX: point.x,
							// 		minY: point.y,
							// 		maxX: point.x,
							// 		maxY: point.y
							// 	});
							// 	for (var i = 0; i < features.length; i++) {
							// 		var feat = features[i].feature;
							// 		if (feat.geometry.type === 'Polygon') {
							// 			if (containsPoint(feat.geometry.coordinates, point)) return feat;
							// 		} else {
							// 			for (var j = 0; j < feat.geometry.coordinates.length; j++) {
							// 				var ring = feat.geometry.coordinates[j];
							// 				if (containsPoint(ring, point)) return feat;
							// 			}
							// 		}
							// 	}
							// }
							// function focusFeature(feat) {
							// 	if (focus) focus.removeFrom(utils.getMap());
							// 	if (feat) {
							// 		if (feat.properties.res !== -1) {
							// 			focus = L.geoJSON(feat, {
							// 				coordsToLatLng: utils.layerPointToLatLng,
							// 				style: function (feature) {
							// 					return {
							// 						fillColor: '#fff',
							// 						fillOpacity: 0.7,
							// 						stroke: false
							// 					};
							// 				},
							// 				interactive: false
							// 			});
							// 			focus.addTo(utils.getMap());
							// 			var insee = feat.properties.insee;
							// 			var dpt;
							// 			if (insee[0] === '9' && insee[1] === '7') {
							// 				dpt = insee.substring(0, 3);
							// 			} else {
							// 				dpt = '0' + insee.substring(0, 2);
							// 			}
							// 			getJSON('data/t2/' + dpt + '/' + feat.properties.insee + '.json', function(data) {
							// 				var merged = barbiche('details').merge({
							// 					panneau2candidate: panneau2candidate,
							// 					panneau2color: panneau2color,
							// 					getRatio: function(a, b) {return Math.round(a * 10000 / b) / 100;},
							// 					fill: function(str) {
							// 						if (str.length < 6) {
							// 							return (new Array(6 - str.length + 1)).join('0') + str;
							// 						} else return str;
							// 					}
							// 				}, data);
							// 				legendContent.innerHTML = '';
							// 				legendContent.appendChild(merged);
							// 				L.DomUtil.removeClass(legend, 'hide');
							// 			});
							// 		} else {
							// 			focus = null;
							// 			L.DomUtil.addClass(legend, 'hide');
							// 		};
							// 	} else {
							// 		focus = null;
							// 		L.DomUtil.addClass(legend, 'hide');
							// 	}
							// }
							utils.getMap().on('click', function(e) {
								var feat = findFeature(e.latlng);
								focusFeature(feat);
							});
							utils.getMap().on('mousemove', L.Util.throttle(function(e) {
								var feat = findFeature(e.latlng);
								if (feat && feat.properties.res !== -1) {
									L.DomUtil.addClass(self._container, 'leaflet-interactive');
								} else {
									L.DomUtil.removeClass(self._container, 'leaflet-interactive');
								}
							}, 32));
							// legendContent.addEventListener('click', function(e) {
							// 	e.stopPropagation();
							// 	var target = e.target;
							// 	if (L.DomUtil.hasClass(target, 'close')) {
							// 		focus.removeFrom(utils.getMap());
							// 		focus = null;
							// 		L.DomUtil.addClass(legend, 'hide');
							// 	}
							// });
							// L.control.photon({
							// 	url: API_URL + '/search/?type=municipality&&',
							// 	placeholder: 'Rechercher une commune',
							// 	position: 'topright',
							// 	minChar: function (val) {
							// 		return SHORT_CITY_NAMES.indexOf(val) !== -1 || val.length >= 3;
							// 	},
							// 	feedbackEmail: null,
							// 	noResultLabel: 'Aucun résultat',
							// 	formatResult: function (feature, el) {
							// 		var title = L.DomUtil.create('strong', '', el);
							// 		var content  = feature.properties.label || feature.properties.name;
							// 		if (feature.properties.postcode) content += '(' + feature.properties.postcode + ')';
							// 		title.innerHTML = content;
							// 	},
							// 	onSelected: function (feature) {
							// 		var latlng = [feature.geometry.coordinates[1], feature.geometry.coordinates[0]];
							// 		var code = feature.properties.citycode;
							// 		var point = project(latlng);
							// 		var epsilon = 35;
							// 		var features = tree.search({
							// 			minX: point.x - epsilon,
							// 			minY: point.y - epsilon,
							// 			maxX: point.x + epsilon,
							// 			maxY: point.y + epsilon
							// 		});
							// 		var feat;
							// 		features.every(function(item) {
							// 			if (item.feature.properties.insee === code) {
							// 				feat = item.feature;
							// 				return false;
							// 			} else return true;
							// 		});
							// 		focusFeature(feat);
							// 		utils.getMap().setView(latlng, 12);
							// 	}
							// }).addTo(utils.getMap());
						})();
					}
					firstDraw = false;
					// mesh.visible = (zoom >= 9);
					// mesh.alpha = meshAlphaScale(zoom);
					prevZoom = zoom;
					renderer.render(container);
				}, pixiContainer, {
					doubleBuffering: doubleBuffering,
					destroyInteractionManager: true
				});
			})();
			pixiLayer.addTo(map);
		});
	});