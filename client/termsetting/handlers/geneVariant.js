import { select } from 'd3-selection'
import { makeSnpSelect } from './snplst'
import { filterInit, getNormalRoot } from '#filter'
import { gmlst2loci } from '#src/client'
import { debounce } from 'debounce'
import { dofetch3 } from '#common/dofetch'
import { string2pos } from '#src/coord'
import { mclass, dt2label } from '#shared/common'

/* 
instance attributes

self.term{}
	.name: str, not really used
	.type: "geneVariant"
*/

const term_name = 'Variants in a locus'

// self is the termsetting instance
export function getHandler(self) {
	return {
		getPillName(d) {
			return self.term.name
		},

		getPillStatus() {
			return { text: self.q.exclude?.length ? 'matching variants' : 'any variant class' }
		},

		validateQ(data) {},

		async showEditMenu(div) {
			await makeEditMenu(self, div)
		}
	}
}

const idPrefix = `_geneVariant_AUTOID_${+new Date()}_`
let id = 0

export function fillTW(tw, vocabApi) {
	if (!('id' in tw)) tw.id = idPrefix + id++
	if (!tw.term.name && tw.term.isoform) tw.term.name = tw.term.isoform

	{
		// apply optional ds-level configs for this specific term
		const c = vocabApi?.termdbConfig.customTwQByType?.geneVariant
		if (c) {
			let d // default q object applicable for this gene
			if (c.byGene?.[tw.term.name]) {
				d = c.byGene[tw.term.name]
			} else if (c.default) {
				d = c.default
			}
			if (d) {
				// has a default, apply
				const q = {}
				Object.assign(q, d, tw.q)
				tw.q = q
			}
		}
	}

	// cnv cutoffs; if the attributes are missing from q{}, add
	if ('cnvMaxLength' in tw.q) {
		// has cutoff
		if (!Number.isInteger(tw.q.cnvMaxLength)) throw 'cnvMaxLength is not integer'
		// cnvMaxLength value<=0 will not filter by length
	} else {
		tw.q.cnvMaxLength = 2000000
	}
	// cutoffs on cnv quantifications, subject to change!
	if ('cnvGainCutoff' in tw.q) {
		if (!Number.isFinite(tw.q.cnvGainCutoff)) throw 'cnvGainCutoff is not finite'
		if (tw.q.cnvGainCutoff < 0) throw 'cnvGainCutoff is not positive'
		// =0 for no filtering gains
	} else {
		tw.q.cnvGainCutoff = 0.2
	}
	if ('cnvLossCutoff' in tw.q) {
		if (!Number.isFinite(tw.q.cnvLossCutoff)) throw 'cnvLossCutoff is not finite'
		if (tw.q.cnvLossCutoff > 0) throw 'cnvLossCutoff is not negative'
		// =0 for not filtering losses
	} else {
		tw.q.cnvLossCutoff = -0.2
	}
}

function makeEditMenu(self, _div) {
	const div = _div
		.append('div')
		.style('padding', '5px')
		.style('cursor', 'pointer')

	div
		.append('div')
		.style('font-size', '1.2rem')
		.text(self.term.name)
	const applyBtn = div
		.append('button')
		.property('disabled', true)
		.style('margin-top', '3px')
		.text('Apply')
		.on('click', () => {
			self.runCallback({
				term: JSON.parse(JSON.stringify(self.term)),
				q: { exclude }
			})
		})

	const exclude = self.q?.exclude?.slice().sort() || []
	const origExclude = JSON.stringify(exclude)
	const mclasses = Object.values(mclass)
	const dtNums = [...new Set(mclasses.map(c => c.dt))].sort()
	const groups = []
	for (const dt of dtNums) {
		const items = mclasses.filter(c => c.dt === dt)
		if (items.length) {
			groups.push({
				name: dt2label[dt],
				items
			})
		}
	}

	const dtDiv = div
		.append('div')
		.selectAll(':scope>div')
		.data(groups, d => d.name)
		.enter()
		.append('div')
		.style('max-width', '500px')
		.style('margin', '5px')
		.style('padding-left', '5px')
		.style('text-align', 'left')
		.each(function(grp) {
			const div = select(this)
			div
				.append('div')
				.style('font-weight', 600)
				.html(grp.name)
			//.on('click', )

			div
				.selectAll(':scope>div')
				.data(grp.items, d => d.label)
				.enter()
				.append('div')
				.style('margin', '5px')
				.style('display', 'inline-block')
				.on('click', function(event, d) {
					const i = exclude.indexOf(d.key)
					if (i == -1) exclude.push(d.key)
					else exclude.splice(i, 1)
					select(this.lastChild).style('text-decoration', i == -1 ? 'line-through' : '')
					applyBtn.property('disabled', JSON.stringify(exclude) === origExclude)
				})
				.each(function(d) {
					const itemDiv = select(this)
					itemDiv
						.append('div')
						.style('display', 'inline-block')
						.style('width', '1rem')
						.style('height', '1rem')
						.style('border', '1px solid #ccc')
						.style('background-color', d.color)
						.html('&nbsp;')

					itemDiv
						.append('div')
						.style('display', 'inline-block')
						.style('margin-left', '3px')
						.style('text-decoration', exclude.includes(d.key) ? 'line-through' : '')
						.style('cursor', 'pointer')
						.text(d.label)
				})
		})
}
