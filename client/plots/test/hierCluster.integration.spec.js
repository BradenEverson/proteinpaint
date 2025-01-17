import * as helpers from '../../test/front.helpers.js'
import tape from 'tape'
import { sleep, detectOne, detectGte, detectLst } from '../../test/test.helpers.js'
import { select } from 'd3-selection'
import { appInit } from '../plot.app.js'
import { fillTermWrapper } from '#termsetting'

/*************************
 reusable helper functions
**************************/

async function getHierClusterApp(_opts = {}) {
	const holder = select('body').append('div')
	const defaults = {
		debug: true,
		holder,
		genome: 'hg38-test',
		state: {
			genome: 'hg38-test',
			dslabel: 'TermdbTest',
			termfilter: { filter0: _opts.filter0 },
			plots: [
				{
					chartType: 'hierCluster',
					settings: {
						hierCluster: {
							termGroupName: 'Gene Expression (CGC genes only)'
						}
					},
					// force empty termgroups, genes since the instance requestData() will not have expression data,
					// and will cause a non-trival error if using the actual requestData(), which will be mocked below
					termgroups: [], // _opts.termgroups || [],
					// !!! there will be an initial load error since this is an empty geneset,
					// !!! but will be ignored since it's not relevant to this test
					genes: _opts.genes || []
					//genes,
					//settings
				}
			]
		},
		app: {
			features: ['recover'],
			callbacks: _opts?.app?.callbacks || {}
		},
		recover: {
			undoHtml: 'Undo',
			redoHtml: 'Redo',
			resetHtml: 'Restore',
			adjustTrackedState(state) {
				const s = structuredClone(state)
				delete s.termfilter.filter0
				return s
			}
		},
		hierCluster: _opts?.hierCluster || {}
	}

	const opts = Object.assign(defaults, _opts)
	const app = await appInit(opts)
	holder.select('.sja_errorbar').node()?.lastChild?.click()
	const hc = Object.values(app.Inner.components.plots).find(
		p => p.type == 'hierCluster' || p.chartType == 'hierCluster'
	).Inner
	return { app, hc }
}

/**************
 test sections
***************/

tape('\n', function (test) {
	test.pass('-***- plots/hierCluster.js -***-')
	test.end()
})

tape('basic render', async test => {
	test.timeoutAfter(2000)
	const { app, hc } = await getHierClusterApp({
		genes: [{ gene: 'AKT1' }, { gene: 'TP53' }, { gene: 'BCR' }, { gene: 'KRAS' }]
	})
	test.equal(hc.dom.termLabelG.selectAll('.sjpp-matrix-label').size(), 4, 'should render 4 gene rows')
	if (test._ok) app.destroy()
	test.end()
})

tape('avoid race condition', async test => {
	// !!!
	// to allow an app or chart code to fail due to race condition,
	// hardcode a constant value or comment out the ++ for the sequenceID
	// in rx/index.js getStoreApi().write()
	// !!!
	test.timeoutAfter(2000)
	const { app, hc } = await getHierClusterApp({
		genes: [{ gene: 'AKT1' }, { gene: 'TP53' }, { gene: 'BCR' }, { gene: 'KRAS' }]
	})
	const termgroups = structuredClone(hc.config.termgroups)
	termgroups[0].lst = [
		await fillTermWrapper({ term: { name: 'AKT1', type: 'geneVariant' } }),
		await fillTermWrapper({ term: { name: 'TP53', type: 'geneVariant' } })
	]
	const responseDelay = 250
	hc.__wait = responseDelay
	hc.origRequestData = hc.requestData
	hc.requestData = async () => {
		const lst = hc.config.termgroups[0].lst
		await sleep(hc.__wait || 0)
		return await hc.origRequestData({})
	}

	await Promise.all([
		app.dispatch({
			type: 'plot_edit',
			id: hc.id,
			config: { termgroups }
		}),
		(async () => {
			await sleep(1)
			hc.__wait = 0
			const termgroups = structuredClone(hc.config.termgroups)
			termgroups[0].lst = [
				await fillTermWrapper({ term: { name: 'AKT1', type: 'geneVariant' } }),
				await fillTermWrapper({ term: { name: 'TP53', type: 'geneVariant' } }),
				await fillTermWrapper({ term: { name: 'KRAS', type: 'geneVariant' } })
			]
			app.dispatch({
				type: 'plot_edit',
				id: hc.id,
				config: { termgroups }
			})
		})()
	])
	// run tests after the delayed response, as part of simulating the race condition
	await sleep(responseDelay + 800)
	test.equal(hc.dom.termLabelG.selectAll('.sjpp-matrix-label').size(), 3, 'should render 3 gene rows')
	const rects = hc.dom.seriesesG.selectAll('.sjpp-mass-series-g rect')
	const hits = rects.filter(d => d.key !== 'BCR' && d.value.class != 'WT' && d.value.class != 'Blank')
	test.equal(
		rects.size(),
		180,
		'should have the expected total number of matrix cell rects, inlcuding WT and not tested'
	)
	test.equal(hits.size(), 180, 'should have the expected number of matrix cell rects with hits')
	if (test._ok) app.destroy()
	test.end()
})

tape('dendrogram click', async function (test) {
	test.timeoutAfter(5000)
	test.plan(2)

	let numRenders = 0
	const { app, hc } = await getHierClusterApp({
		genes: [{ gene: 'AKT1' }, { gene: 'TP53' }, { gene: 'BCR' }, { gene: 'KRAS' }]
	})

	const img = await detectOne({ elem: hc.dom.topDendrogram.node(), selector: 'image' })
	const svgBox = hc.dom.svg.node().getBoundingClientRect()
	const imgBox = img.getBBox()
	// helper to see where the x, y position of the click
	// select('body')
	// 	.append('div')
	// 	.style('position', 'absolute')
	// 	.style('top', svgBox.y + imgBox.y + imgBox.height/2)
	// 	.style('left', svgBox.x + hc.dimensions.xOffset + imgBox.x + imgBox.width/2)
	// 	.style('width', '5px').style('height', '5px')
	// 	.style('background-color', '#00f')

	img.dispatchEvent(
		new MouseEvent('click', {
			//'view': window,
			bubbles: true,
			cancelable: true,
			clientX: svgBox.x + hc.dimensions.xOffset + imgBox.x + imgBox.width / 2,
			clientY: svgBox.y + imgBox.y + imgBox.height / 2
		})
	)

	// TODO: low priority - find a way to test the red lines vs black lines in the dendrogram branches?

	test.deepEqual(
		['Zoom in', 'List 50 samples'],
		[...hc.dom.dendroClickMenu.d.node().querySelectorAll('.sja_menuoption')].map(elem => elem.__data__.label),
		'should show the expected menu options on dendrogram click'
	)

	hc.dom.dendroClickMenu.d.node().querySelector('.sja_menuoption').parentNode.lastChild.click()
	await sleep(5)
	test.equal(
		hc.dom.dendroClickMenu.d.node().querySelectorAll('.sjpp_row_wrapper').length,
		50,
		'should list the expected number of samples'
	)
	if (test._ok) {
		hc.dom.dendroClickMenu.clear().hide()
		app.destroy()
	}
})
