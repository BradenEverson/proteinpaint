// import { getcategoriesRequest, getcategoriesResponse } from '#shared/types/routes/termdb.categories'
import { getOrderedLabels } from '#src/termdb.barchart.js'
import { getData } from '#src/termdb.matrix.js'

export const api: any = {
	endpoint: 'termdb/categories',
	methods: {
		get: {
			init,
			request: {
				typeId: 'getcategoriesRequest'
			},
			response: {
				typeId: 'getcategoriesResponse'
			},
			examples: [
				{
					request: {
						body: {
							genome: 'hg38-test',
							dslabel: 'TermdbTest',
							embedder: 'localhost',
							getcategories: 1,
							tid: 'diaggrp',
							filter: {
								type: 'tvslst',
								in: true,
								join: '',
								lst: [
									{
										tag: 'cohortFilter',
										type: 'tvs',
										tvs: {
											term: {
												name: 'Cohort',
												type: 'categorical',
												values: { ABC: { label: 'ABC' }, XYZ: { label: 'XYZ' } },
												id: 'subcohort',
												isleaf: false,
												groupsetting: { disabled: true }
											},
											values: [{ key: 'ABC', label: 'ABC' }]
										}
									}
								]
							}
						}
					},
					response: {
						header: { status: 200 }
					}
				}
			]
		},
		post: {
			alternativeFor: 'get',
			init
		}
	}
}

function init({ genomes }) {
	return async (req: any, res: any): Promise<void> => {
		const q = req.query // as getcategoriesRequest
		try {
			const g = genomes[req.query.genome]
			const ds = g.datasets[req.query.dslabel]
			const tdb = ds.cohort.termdb

			if (!g) throw 'invalid genome name'
			if (!ds) throw 'invalid dataset name'
			if (!tdb) throw 'invalid termdb object'
			await trigger_getcategories(q, res, tdb, ds, g) // as getcategoriesResponse
		} catch (e) {
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			res.send({ error: e?.message || e })
			if (e instanceof Error && e.stack) console.log(e)
		}
	}
}

async function trigger_getcategories(q, res, tdb, ds, genome) {
	// thin wrapper of get_summary
	// works for all types of terms
	if (!q.tid) throw '.tid missing'
	const term =
		q.type == 'geneVariant' ? { name: q.tid, type: 'geneVariant', isleaf: true } : tdb.q.termjsonByOneid(q.tid)
	const arg = {
		filter: q.filter,
		terms:
			q.type == 'geneVariant'
				? [{ term: term, q: { isAtomic: true } }]
				: [{ id: q.tid, term, q: q.term1_q || getDefaultQ(term, q) }],
		currentGeneNames: q.currentGeneNames
	}

	const data = await getData(arg, ds, genome)
	if (data.error) throw data.error

	const lst = []
	if (q.type == 'geneVariant') {
		const samples = data.samples
		const dtClassMap = new Map()
		if (ds.assayAvailability?.byDt) {
			for (const [dtType, dtValue] of Object.entries(ds.assayAvailability.byDt)) {
				if (dtValue.byOrigin) {
					dtClassMap.set(parseInt(dtType), { byOrigin: { germline: {}, somatic: {} } })
				}
			}
		}
		const sampleCountedFor = new Set() // if the sample is conunted for the
		for (const [sampleId, sampleData] of Object.entries(samples)) {
			const values = sampleData[q.tid].values
			sampleCountedFor.clear()
			/* values here is an array of result entires, one or more entries for each dt. e.g.
			[
				{ dt: 1, class: 'Blank', _SAMPLEID_: 1, origin: 'germline' },
				{ dt: 1, class: 'WT', _SAMPLEID_: 1, origin: 'somatic' },
				{ dt: 2, class: 'Blank', _SAMPLEID_: 1 },
				{ dt: 4, class: 'WT', _SAMPLEID_: 1 }
			]
			*/
			for (const value of values) {
				if (!dtClassMap.has(value.dt)) {
					dtClassMap.set(value.dt, {})
				}
				const dtClasses = dtClassMap.get(value.dt)
				if (dtClasses.byOrigin) {
					if (!dtClasses.byOrigin[value.origin][value.class]) {
						dtClasses.byOrigin[value.origin][value.class] = 1
						sampleCountedFor.add(`${value.dt} ${value.origin} ${value.class}`)
					}
					if (!sampleCountedFor.has(`${value.dt} ${value.origin} ${value.class}`)) {
						sampleCountedFor.add(`${value.dt} ${value.origin} ${value.class}`)
						dtClasses.byOrigin[value.origin][value.class] += 1
					}
				} else {
					if (!dtClasses[value.class]) {
						sampleCountedFor.add(`${value.dt} ${value.class}`)
						dtClasses[value.class] = 1
					}
					if (!sampleCountedFor.has(`${value.dt} ${value.class}`)) {
						sampleCountedFor.add(`${value.dt} ${value.class}`)
						dtClasses[value.class] += 1
					}
				}
			}
		}
		for (const [dt, classes] of dtClassMap) {
			lst.push({
				dt,
				classes
			})
		}
	} else {
		const key2count = new Map()
		// k: category key
		// v: number of samples
		for (const sid in data.samples) {
			const v = data.samples[sid][q.tid]
			if (!v) continue
			if (!('key' in v)) continue
			key2count.set(v.key, 1 + (key2count.get(v.key) || 0))
		}
		for (const [key, count] of key2count) {
			lst.push({
				samplecount: count,
				key,
				label:
					data.refs?.byTermId?.[q.tid]?.events?.find(e => e.event === key).label || term?.values?.[key]?.label || key
			})
		}
	}

	const orderedLabels = getOrderedLabels(
		term,
		data.refs?.byTermId?.[q.tid]?.bins || [],
		data.refs?.byTermId?.[q.tid]?.events,
		q.term1_q
	)
	if (orderedLabels.length) {
		lst.sort((a, b) => orderedLabels.indexOf(a.label) - orderedLabels.indexOf(b.label))
	}
	res.send({
		lst,
		orderedLabels
	})
}

function getDefaultQ(term, q) {
	if (term.type == 'categorical') return {}
	if (term.type == 'survival') return {}
	if (term.type == 'integer' || term.type == 'float') return term.bins.default
	if (term.type == 'condition') {
		return {
			mode: q.mode,
			breaks: q.breaks,
			bar_by_grade: q.bar_by_grade,
			/*Leave this here until bug with term1_q not passing to getCategories is figured out.
			Commented out b/c tvs condition tests fail.*/
			//bar_by_children: term.subconditions || q.bar_by_children,
			bar_by_children: q.bar_by_children,
			value_by_max_grade: q.value_by_max_grade,
			value_by_most_recent: q.value_by_most_recent,
			//value_by_computable_grade: term.subconditions || q.value_by_computable_grade
			value_by_computable_grade: q.value_by_computable_grade
		}
	}
	if (term.type == 'geneVariant') return {}
	throw 'unknown term type'
}