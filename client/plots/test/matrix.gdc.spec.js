import * as helpers from '../../test/front.helpers.js'
import tape from 'tape'
import { sleep, detectOne, detectGte, detectLst } from '../../test/test.helpers.js'
import { runproteinpaint } from '#src/app'
import { select } from 'd3-selection'

/*************************
 reusable helper functions
**************************/

const runpp = helpers.getRunPp('mass', {
	state: {
		dslabel: 'GDC',
		genome: 'hg38'
	},
	debug: 1
})

/**************
 test sections

2 genes, 2 dict terms
2 genes, 2 dict terms, divideBy
launch matrix using runproteinpaint with launchGdcMatrix

***************/
tape('\n', function (test) {
	test.pass('-***- plots/matrix.gdc (aka OncoMatrix) -***-')
	test.end()
})

tape('2 genes, 2 dict terms', function (test) {
	test.timeoutAfter(5000)
	test.plan(10)
	runpp({
		state: {
			nav: { header_mode: 'hidden' }, // must set to hidden for gdc, since it lacks termdb method to get cohort size..
			plots: [
				{
					chartType: 'matrix',
					settings: {
						matrix: {
							// the matrix autocomputes the colw based on available screen width,
							// need to set an exact screen width for consistent tests using getBBox()
							availContentWidth: 1200
						}
					},
					termgroups: [
						{
							lst: [
								{ term: { name: 'IDH1', type: 'geneVariant' } },
								{ term: { name: 'EGFR', type: 'geneVariant' } },
								{ id: 'case.disease_type' },
								{ id: 'case.diagnoses.age_at_diagnosis' }
							]
						}
					]
				}
			]
		},
		matrix: {
			callbacks: {
				'postRender.test': runTests
			}
		}
	})

	async function runTests(matrix) {
		matrix.on('postRender.test', null)
		await testMatrixrendering(matrix)
		await testLegendRendering(matrix)
		await testBtnRendering(matrix)
		await testZoom(matrix)
		await testCaseLabelCharLimit(matrix)
		await testRowLabelCharLimit(matrix)
		await testGroupBy(matrix)

		if (test._ok) matrix.Inner.app.destroy()
		test.end()
	}

	async function testMatrixrendering(matrix) {
		await detectOne({ elem: matrix.Inner.dom.seriesesG.node(), selector: 'image' })
		test.equal(matrix.Inner.dom.seriesesG.selectAll('image').size(), 1, `should render 1 <image> element`)
		test.equal(
			matrix.Inner.dom.svg.selectAll('.sjpp-matrix-term-label-g').node().querySelectorAll('text').length,
			4,
			`should render 4 <series> elements`
		)
	}

	async function testLegendRendering(matrix) {
		test.true(matrix.Inner.dom.legendG.nodes().length > 0, `should render legend`)
		test.true(matrix.Inner.dom.legendG.selectAll('rect').size() > 0, `should render legend rects`)
		test.true(matrix.Inner.dom.legendG.selectAll('text').size() > 0, `should render legend text`)
	}

	async function testBtnRendering(matrix) {
		test.equal(matrix.Inner.dom.controls.node().querySelectorAll('button').length, 8, `should render buttons`)
	}

	async function testZoom(matrix) {
		//test zoom in feature
		await matrix.Inner.app.dispatch({
			type: 'plot_edit',
			id: matrix.Inner.id,
			config: {
				settings: {
					matrix: {
						zoomLevel: 10
					}
				}
			}
		})
		test.equal(matrix.Inner.config.settings.matrix.zoomLevel, 10, `should zoom in`)
	}

	async function testCaseLabelCharLimit(matrix) {
		//test Case Label character limit feature
		await matrix.Inner.app.dispatch({
			type: 'plot_edit',
			id: matrix.Inner.id,
			config: {
				settings: {
					matrix: {
						collabelmaxchars: 10
					}
				}
			}
		})
		test.equal(
			matrix.Inner.config.settings.matrix.collabelmaxchars,
			10,
			`should limit case label characters to ${matrix.Inner.config.settings.matrix.collabelmaxchars}`
		)
	}

	async function testRowLabelCharLimit(matrix) {
		// test Case Row Label max character limit feature
		await matrix.Inner.app.dispatch({
			type: 'plot_edit',
			id: matrix.Inner.id,
			config: {
				settings: {
					matrix: {
						rowlabelmaxchars: 10
					}
				}
			}
		})
		test.equal(
			matrix.Inner.config.settings.matrix.rowlabelmaxchars,
			10,
			`should limit row label characters to ${matrix.Inner.config.settings.matrix.rowlabelmaxchars}`
		)
	}

	async function testGroupBy(matrix) {
		//test Group by feature. Note groups are not provided in the test data, so groups don't show up on the UI
		await matrix.Inner.app.dispatch({
			type: 'plot_edit',
			id: matrix.Inner.id,
			config: {
				divideBy: {
					id: 'case.primary_site',
					q: {
						type: 'values'
					},
					term: {
						id: 'case.primary_site',
						name: 'Primary Site',
						type: 'categorical'
					}
				}
			}
		})
		test.equal(
			matrix.Inner.config.divideBy.id,
			'case.primary_site',
			`should group by ${matrix.Inner.config.divideBy.id}`
		)
	}
})

tape('2 genes, 2 dict terms, divideBy', function (test) {
	test.timeoutAfter(5000)
	test.plan(5)
	runpp({
		state: {
			nav: { header_mode: 'hidden' }, // must set to hidden for gdc, since it lacks termdb method to get cohort size..
			plots: [
				{
					chartType: 'matrix',
					settings: {
						matrix: {
							// the matrix autocomputes the colw based on available screen width,
							// need to set an exact screen width for consistent tests using getBBox()
							availContentWidth: 1200
						}
					},
					divideBy: {
						id: 'case.disease_type'
					},
					termgroups: [
						{
							lst: [
								{ term: { name: 'IDH1', type: 'geneVariant' } },
								{ term: { name: 'EGFR', type: 'geneVariant' } },
								{ id: 'case.disease_type' },
								{ id: 'case.diagnoses.age_at_diagnosis' }
							]
						}
					]
				}
			]
		},
		matrix: {
			callbacks: {
				'postRender.test': runTests
			}
		}
	})

	async function runTests(matrix) {
		matrix.on('postRender.test', null)
		await testSortingFunctionalities(matrix)
		await testMaxCases(matrix)
		if (test._ok) matrix.Inner.app.destroy()
		test.end()
	}

	async function testMaxCases(matrix) {
		//test max cases feature
		test.equal(matrix.Inner.config.settings.matrix.maxSample, 2000, `should limit max cases to 2000`)

		//reduce sample size
		await matrix.Inner.app.dispatch({
			type: 'plot_edit',
			id: matrix.Inner.id,
			config: {
				settings: {
					matrix: {
						maxSample: 1000
					}
				}
			}
		})
		test.equal(matrix.Inner.config.settings.matrix.maxSample, 1000, `should limit max cases to 1000`)
	}

	async function testSortingFunctionalities(matrix) {
		//test sample grouping
		await matrix.Inner.app.dispatch({
			type: 'plot_edit',
			id: matrix.Inner.id,
			config: {
				settings: {
					matrix: {
						groupSamplesBy: 'disease_type'
					}
				}
			}
		})
		test.equal(
			matrix.Inner.config.settings.matrix.groupSamplesBy,
			'disease_type',
			`should group samples by ${matrix.Inner.config.settings.matrix.groupSamplesBy}`
		)

		//test sampleGrpsBy sort feature
		await matrix.Inner.app.dispatch({
			type: 'plot_edit',
			id: matrix.Inner.id,
			config: {
				settings: {
					matrix: {
						sortSampleGrpsBy: 'hits'
					}
				}
			}
		})
		test.equal(
			matrix.Inner.config.settings.matrix.sortSampleGrpsBy,
			'hits',
			`should sort sample groups by ${matrix.Inner.config.settings.matrix.sortSampleGrpsBy}`
		)

		//test Case sorting feature
		await matrix.Inner.app.dispatch({
			type: 'plot_edit',
			id: matrix.Inner.id,
			config: {
				settings: {
					matrix: {
						sortSamplesBy: 'name'
					}
				}
			}
		})
		test.equal(
			matrix.Inner.config.settings.matrix.sortSamplesBy,
			'name',
			`should sort cases by ${matrix.Inner.config.settings.matrix.sortSamplesBy}`
		)
	}
})

tape('launch matrix using runproteinpaint with launchGdcMatrix', async function (test) {
	await runproteinpaint({
		holder: select('body').append('div').node(),
		noheader: 1,
		launchGdcMatrix: true,
		filter0: {
			op: 'and',
			content: [{ op: 'in', content: { field: 'cases.disease_type', value: ['Gliomas'] } }]
		},
		settings: {
			matrix: {
				maxGenes: 50,
				maxSample: 10000
			}
		},
		termgroups: [
			{
				lst: [
					{ term: { name: 'IDH1', type: 'geneVariant' } },
					{ term: { name: 'EGFR', type: 'geneVariant' } },
					{ id: 'case.disease_type' },
					{ id: 'case.diagnoses.age_at_diagnosis' }
				]
			}
		]
	})
	test.end()
})
