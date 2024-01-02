import { TermdbClusterRequest, TermdbClusterResponse } from '#shared/types/routes/termdb.cluster.ts'
import fs from 'fs'
import path from 'path'
import * as utils from '#src/utils.js'
import serverconfig from '#src/serverconfig.js'
import { GeneExpressionQuery, GeneExpressionQueryNative } from '#shared/types/dataset.ts'
import { gdc_validate_query_geneExpression } from '#src/mds3.gdc.js'
import { mayLimitSamples } from '#src/mds3.filter.js'
import { doClustering } from '#src/doClustering.js' // unable to convert this to ts yet, when converted, move all code here
import { dtgeneexpression } from '#shared/common.js'

export const api = {
	endpoint: 'termdb/cluster',
	methods: {
		get: {
			init,
			request: {
				typeId: 'TermdbClusterRequest'
			},
			response: {
				typeId: 'TermdbClusterResponse'
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
		const q = req.query as TermdbClusterRequest
		let result
		try {
			const g = genomes[q.genome]
			if (!g) throw 'invalid genome name'
			const ds = g.datasets[q.dslabel]
			if (!ds) throw 'invalid dataset name'
			if (q.dataType == dtgeneexpression) {
				if (!ds.queries?.geneExpression) throw 'no geneExpression data on this dataset'
				result = (await getResult(q, ds)) as TermdbClusterResponse
			} else {
				throw 'unknown q.dataType ' + q.dataType
			}
		} catch (e: any) {
			if (e.stack) console.log(e.stack)
			result = {
				status: e.status || 400,
				error: e.message || e
			} as TermdbClusterResponse
		}
		res.send(result)
	}
}

async function getResult(q: TermdbClusterRequest, ds: any) {
	const { gene2sample2value, byTermId, bySampleId } = await ds.queries.geneExpression.get(q)
	if (gene2sample2value.size == 0) throw 'no data'
	if (gene2sample2value.size == 1) {
		// get data for only 1 gene; still return data, may create violin plot later
		const g = Array.from(gene2sample2value.keys())[0]
		return { gene: g, data: gene2sample2value.get(g) }
	}

	// have data for multiple genes, run clustering
	const t = Date.now() // use "t=new Date()" will lead to tsc error
	const clustering = await doClustering(gene2sample2value, q, ds)
	if (serverconfig.debugmode) console.log('clustering done:', Date.now() - t, 'ms')
	return { clustering, byTermId, bySampleId }
}

export async function validate_query_geneExpression(ds: any, genome: any) {
	const q = ds.queries.geneExpression as GeneExpressionQuery
	if (!q) return

	if (q.src == 'gdcapi') {
		gdc_validate_query_geneExpression(ds, genome)
		// q.get() added
		return
	}
	if (q.src == 'native') {
		validateNative(q, ds, genome)
		return
	}
	throw 'unknown queries.geneExpression.src'
}

async function validateNative(q: GeneExpressionQueryNative, ds: any, genome: any) {
	q.file = path.join(serverconfig.tpmasterdir, q.file)
	await utils.validate_tabixfile(q.file)
	q.nochr = await utils.tabix_is_nochr(q.file, null, genome)
	q.samples = [] as number[]

	{
		// is a gene-by-sample matrix file
		const lines = await utils.get_header_tabix(q.file)
		if (!lines[0]) throw 'header line missing from ' + q.file
		const l = lines[0].split('\t')
		if (l.slice(0, 4).join('\t') != '#chr\tstart\tstop\tgene') throw 'header line has wrong content for columns 1-4'
		for (let i = 4; i < l.length; i++) {
			const id = ds.cohort.termdb.q.sampleName2id(l[i])
			if (id == undefined) throw 'unknown sample from header'
			q.samples.push(id)
		}
		console.log(q.samples.length, 'samples from geneExpression of', ds.label)
	}

	/*
	query exp data one gene at a time
	param{}
	.genes[{}]
		.gene=str
		.chr=str
		.start=int
		.stop=int
	.filterObj{}
	*/
	q.get = async (param: TermdbClusterRequest) => {
		const limitSamples = await mayLimitSamples(param, q.samples, ds)
		if (limitSamples?.size == 0) {
			// got 0 sample after filtering, return blank array for no data
			return new Set()
		}

		// has at least 1 sample passing filter and with exp data
		// TODO what if there's just 1 sample not enough for clustering?
		const bySampleId = {}
		if (limitSamples) {
			for (const sid of limitSamples) {
				bySampleId[sid] = { label: ds.cohort.termdb.q.id2sampleName(sid) }
			}
		} else {
			// use all samples with exp data
			for (const sid of q.samples) {
				bySampleId[sid] = { label: ds.cohort.termdb.q.id2sampleName(sid) }
			}
		}

		const gene2sample2value = new Map() // k: gene symbol, v: { sampleId : value }

		for (const g of param.genes) {
			// FIXME newly added geneVariant terms from client to be changed to {gene} but not {name}
			if (!g.gene) continue

			if (!g.chr) {
				// quick fix: newly added gene from client will lack chr/start/stop
				const lst = genome.genedb.getjsonbyname.all(g.gene)
				if (lst.length == 0) continue
				const j = JSON.parse(lst.find(i => i.isdefault).genemodel || lst[0].genemodel)
				g.start = j.start
				g.stop = j.stop
				g.chr = j.chr
			}

			gene2sample2value.set(g.gene, {})
			await utils.get_lines_bigfile({
				args: [q.file, (q.nochr ? g.chr?.replace('chr', '') : g.chr) + ':' + g.start + '-' + g.stop], // must do g.chr?.replace to avoid tsc error
				callback: line => {
					const l = line.split('\t')
					// case-insensitive match! FIXME if g.gene is alias won't work
					if (l[3].toLowerCase() != g.gene.toLowerCase()) return
					for (let i = 4; i < l.length; i++) {
						const sampleId = q.samples[i - 4]
						if (limitSamples && !limitSamples.has(sampleId)) continue // doing filtering and sample of current column is not used
						// if l[i] is blank string?
						const v = Number(l[i])
						if (Number.isNaN(v)) throw 'exp value not number'
						gene2sample2value.get(g.gene)[sampleId] = v
					}
				}
			} as any)
			// Above!! add "as any" to suppress a npx tsc alert
		}
		// pass blank byTermId to match with expected output structure
		const byTermId = {}
		return { gene2sample2value, byTermId, bySampleId }
	}
}