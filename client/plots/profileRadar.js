import { getCompInit, copyMerge } from '#rx'
import { fillTermWrapper } from '#termsetting'
import * as d3 from 'd3'
import { getSampleFilter } from '#termsetting/handlers/samplelst'
import { profilePlot } from './profilePlot.js'
import { Menu } from '#dom/menu'

class profileRadar extends profilePlot {
	constructor() {
		super()
		this.type = 'profileRadar'
		this.radius = 250
	}
	async init(appState) {
		await super.init(appState)
		this.opts.header.text('Radar Graph')
		this.lineGenerator = d3.line()
		this.tip = new Menu({ padding: '4px', offsetX: 10, offsetY: 15 })
	}

	async main() {
		this.config = JSON.parse(JSON.stringify(this.state.config))
		this.twLst = []
		for (const [i, tw] of this.config.terms.entries()) {
			if (tw.id) this.twLst.push(tw)
		}
		this.twLst.push(this.config.typeTW)
		const sampleName = this.config.region !== undefined ? this.config.region : this.config.income || 'Global'
		const filter = this.config.filter || getSampleFilter(this.sampleidmap[sampleName])
		this.data = await this.app.vocabApi.getAnnotatedSampleData({
			terms: this.twLst,
			filter
		})
		this.sampleData = this.data.lst[0]
		this.angle = (Math.PI * 2) / this.config.terms.length

		this.income = this.config.income || this.incomes[0]
		this.region = this.config.region !== undefined ? this.config.region : this.income == '' ? 'Global' : ''

		this.setFilter()

		this.filename = `radar_plot${this.region ? '_' + this.region : ''}${this.income ? '_' + this.income : ''}.svg`
			.split(' ')
			.join('_')
		this.plot()
	}

	plot() {
		const config = this.config
		this.dom.plotDiv.selectAll('*').remove()

		if (!this.sampleData) return

		this.svg = this.dom.plotDiv.append('svg').attr('width', 1200).attr('height', 600)

		// Create a polar grid.
		const radius = this.radius
		const x = 400
		const y = 300
		const polarG = this.svg.append('g').attr('transform', `translate(${x},${y})`)
		this.polarG = polarG
		const legendG = this.svg.append('g').attr('transform', `translate(${x + 550},${y + 150})`)
		const angle = this.angle

		for (let i = 0; i <= 10; i++) this.addPoligon(i * 10)

		let i = 0
		const data = []
		for (let d of config.terms) {
			d.i = i
			const iangle = i * angle - Math.PI / 2
			const percentage = this.sampleData[d.$id]?.value
			const iradius = (percentage / 100) * radius

			let dx = iradius * Math.cos(iangle)
			let dy = iradius * Math.sin(iangle)
			data.push([dx, dy])
			polarG.append('g').attr('transform', `translate(${dx}, ${dy})`).append('circle').attr('r', 5).attr('fill', 'gray')

			i++
			const leftSide = iangle > Math.PI / 2 && iangle <= (3 / 2) * Math.PI
			dx = radius * 1.1 * Math.cos(iangle)
			dy = radius * 1.1 * Math.sin(iangle) - 10
			const textElem = polarG.append('text').attr('x', `${dx}px`).attr('y', `${dy}px`)

			const texts = d.term.name.split(' ')
			let span
			texts.forEach((text, j) => {
				if (text != 'and') {
					dy += 15
					span = textElem
						.append('tspan')
						.attr('x', `${dx}px`)
						.attr('y', `${dy}px`)
						.text(text + '')
				} else span.append('tspan').text(' and')
			})
			if (leftSide) textElem.attr('text-anchor', 'end')
		}
		data.push(data[0])
		const path = polarG
			.append('g')
			.append('path')
			.style('stroke', '#aaa')
			.attr('fill', 'none')
			.attr('stroke', 'black')
			.attr('stroke-width', '2px')
			.attr('d', this.lineGenerator(data))

		this.addPoligon(50, 'C')
		this.addPoligon(75, 'B')
		this.addPoligon(100, 'A')
		for (let i = 0; i <= 10; i++) {
			const percent = i * 10
			polarG
				.append('text')
				.attr('transform', `translate(-10, ${(-percent / 100) * radius + 5})`)
				.attr('text-anchor', 'end')
				.style('font-size', '0.8rem')
				.text(`${percent}%`)
				.attr('pointer-events', 'none')
		}
		legendG
			.append('text')
			.attr('text-anchor', 'left')
			.style('font-weight', 'bold')
			.text('Overall Score')
			.attr('transform', `translate(0, -10)`)

		addLegendItem('A', 'More than 75% of possible scorable items', 1)
		addLegendItem('B', '50-75% of possible scorable items', 2)
		addLegendItem('C', 'Less than 50% of possible scorable items', 3)

		function addLegendItem(category, description, index) {
			const text = legendG
				.append('text')
				.attr('transform', `translate(0, ${index * 20})`)
				.attr('text-anchor', 'left')
			text.append('tspan').attr('font-weight', 'bold').text(category)
			text.append('tspan').text(`: ${description}`)
		}
	}

	addPoligon(percent, text = null) {
		const data = []
		for (let i = 0; i < this.config.terms.length; i++) {
			const iangle = i * this.angle
			const iradius = (percent / 100) * this.radius
			const x = iradius * Math.cos(iangle)
			const y = iradius * Math.sin(iangle)
			data.push([x, y])
		}

		data.push(data[0])
		const poligon = this.polarG
			.append('g')
			.append('path')
			.style('stroke', '#aaa')
			.attr('fill', 'none')
			.attr('stroke', 'black')
			.attr('d', this.lineGenerator(data))
			.style('opacity', '0.5')
		if (percent != 50) poligon.style('stroke', '#aaa')
		if (text) {
			if (percent != 100) poligon.style('stroke-dasharray', '5, 5').style('stroke-width', '2').style('stroke', 'black')

			this.polarG
				.append('text')
				.attr('transform', `translate(15, ${-(percent / 100 - 0.125) * this.radius + 10})`)
				.attr('text-anchor', 'middle')
				.text(text)
				.style('font-weight', 'bold')
				.style('font-size', '24px')
				.attr('pointer-events', 'none')
		}
	}
}

export async function getPlotConfig(opts, app) {
	try {
		const defaults = app.vocabApi.termdbConfig?.chartConfigByType?.profileRadar
		if (!defaults) throw 'default config not found in termdbConfig.chartConfigByType.profileRadar'
		const config = copyMerge(structuredClone(defaults), opts)
		for (const t of config.terms) {
			if (t.id) await fillTermWrapper(t, app.vocabApi)
		}
		config.typeTW = await fillTermWrapper({ id: 'sampleType' }, app.vocabApi)
		return config
	} catch (e) {
		throw `${e} [profileRadar getPlotConfig()]`
	}
}

export const profileRadarInit = getCompInit(profileRadar)
// this alias will allow abstracted dynamic imports
export const componentInit = profileRadarInit
