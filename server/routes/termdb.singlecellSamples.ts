import fs from 'fs'
import path from 'path'
import { read_file } from '#src/utils.js'
import serverconfig from '#src/serverconfig.js'
import {
	SingleCellQuery,
	SingleCellSamplesNative,
	SingleCellSamplesGdc,
	SingleCellDataNative,
	SingleCellDataGdc
} from '#shared/types/dataset.ts'
import {
	Sample,
	TermdbSinglecellsamplesRequest,
	TermdbSinglecellsamplesResponse
} from '#shared/types/routes/termdb.singlecellSamples.ts'
import { Cell, Plot } from '#shared/types/routes/termdb.singlecellData.ts'
import { gdc_validate_query_singleCell_samples, gdc_validate_query_singleCell_data } from '#src/mds3.gdc.js'

/* route returns list of samples with sc data
this is due to the fact that sometimes not all samples in a dataset has sc data
*/

export const api: any = {
	endpoint: 'termdb/singlecellSamples',
	methods: {
		get: {
			init,
			request: {
				typeId: 'TermdbSinglecellsamplesRequest'
			},
			response: {
				typeId: 'TermdbSinglecellsamplesResponse'
			}
		},
		post: {
			alternativeFor: 'get',
			init
		}
	}
}

function init({ genomes }) {
	return async (req: any, res: any): Promise<void> => {
		const q = req.query as TermdbSinglecellsamplesRequest
		let result
		try {
			const g = genomes[q.genome]
			if (!g) throw 'invalid genome name'
			const ds = g.datasets[q.dslabel]
			if (!ds) throw 'invalid dataset name'
			if (!ds.queries?.singleCell) throw 'no singlecell data on this dataset'
			result = (await ds.queries.singleCell.samples.get(q)) as TermdbSinglecellsamplesResponse
			result.sameLegend = ds.queries.singleCell.samples.sameLegend
		} catch (e: any) {
			if (e.stack) console.log(e.stack)
			result = {
				status: e.status || 400,
				error: e.message || e
			} as TermdbSinglecellsamplesResponse
		}
		res.send(result)
	}
}

/////////////////// ds query validator
export async function validate_query_singleCell(ds: any, genome: any) {
	const q = ds.queries.singleCell as SingleCellQuery
	if (!q) return

	if (q.samples.src == 'gdcapi') {
		gdc_validate_query_singleCell_samples(ds, genome)
	} else if (q.samples.src == 'native') {
		validateSamplesNative(q.samples as SingleCellSamplesNative, ds)
	} else {
		throw 'unknown singleCell.samples.src'
	}
	// q.samples.get() added

	if (q.data.src == 'gdcapi') {
		gdc_validate_query_singleCell_data(ds, genome)
	} else if (q.data.src == 'native') {
		validateDataNative(q.data as SingleCellDataNative, ds)
	} else {
		throw 'unknown singleCell.data.src'
	}
	// q.data.get() added
}

function validateSamplesNative(S: SingleCellSamplesNative, ds: any) {
	// for now use this quick fix method to pull sample ids annotated by this term
	// to support situation where not all samples from a dataset has sc data
	const samples = [] as Sample[] // list of sample ids with sc data
	const s = ds.cohort.termdb.q.getAllValues4term(S.isSampleTerm)
	for (const id of s.keys()) {
		samples.push({ sample: ds.cohort.termdb.q.id2sampleName(id) })
	}
	if (samples.length == 0) throw 'no sample with sc data'
	// getter returns array of {sample:<samplename>, files:[]} where files is gdc specific. each sample is an obj and allows to add ds-specific stuff
	S.get = () => {
		return { samples, fields: ['sample'], columnNames: ['Sample'] }
	}
}

function validateDataNative(D: SingleCellDataNative, ds: any) {
	const nameSet = new Set() // guard against duplicating plot names
	for (const plot of D.plots) {
		if (nameSet.has(plot.name)) throw 'duplicate plot.name'
		nameSet.add(plot.name)
	}

	// scoped and cached for runtime
	const _terms = [] as any
	const _tid2cellvalue = {} as any

	for (const tid of D.termIds) {
		const t = ds.cohort.termdb.q.termjsonByOneid(tid)
		if (!t) throw 'invalid term id from queries.singleCell.data.termIds[]'
		_terms.push(t)
		// _tid2cellvalue[tid] = {}
		// const clusterMap = ds.cohort.termdb.q.getAllValues4term(tid)
		// for(const [id, cluster] of clusterMap)
		// {
		// 	const name = ds.cohort.termdb.q.id2sampleName(id)
		// 	_tid2cellvalue[tid][name] = cluster
		// }
	}
	D.get = async q => {
		// if sample is int, may convert to string
		try {
			const tid2cellvalue = {}
			for (const tid of D.termIds) tid2cellvalue[tid] = {} // k: cell id, v: cell value for this term
			const plots = [] as Plot[] // given a sample name, collect every plot data for this sample and return
			for (const plot of D.plots) {
				const tsvfile = path.join(serverconfig.tpmasterdir, plot.folder, q.sample + plot.fileSuffix)
				try {
					await fs.promises.stat(tsvfile)
				} catch (e: any) {
					if (e.code == 'ENOENT') {
						// no file found for this sample; allowed because sampleView tests if that sample has sc data or not
						continue
					}
					if (e.code == 'EACCES') throw 'cannot read file, permission denied'
					throw 'failed to load sc data file'
				}
				const lines = (await read_file(tsvfile)).trim().split('\n')
				// 1st line is header
				const cells = [] as Cell[]
				for (let i = 1; i < lines.length; i++) {
					// each line is a cell
					const l = lines[i].split('\t')
					const cellId = l[0],
						x = Number(l[plot.coordsColumns.x]), // FIXME standardize, or define idx in plot
						y = Number(l[plot.coordsColumns.y])
					const category = l[plot.colorColumn?.index] || ''
					if (!cellId) throw 'cell id missing'
					if (!Number.isFinite(x) || !Number.isFinite(y)) throw 'x/y not number'
					cells.push({ cellId, x, y, category })

					for (const tid of D.termIds) {
						tid2cellvalue[tid][cellId] = l[1]
					}
				}
				plots.push({ name: plot.name, cells, colorBy: plot.colorColumn?.name })
			}
			if (plots.length == 0) {
				// no data available for this sample
				return { nodata: true }
			}
			return { plots, terms: _terms, tid2cellvalue }
		} catch (e: any) {
			if (e.stack) console.log(e.stack)
			return { error: e.message || e }
		}
	}
}
