import { ErrorResponse } from './errorResponse'

export type Sample = {
	/** Sample name, required */
	sample: string
	/** optional list of sc data files available for this sample, gdc-specific */
	files?: any
}

export type TermdbSinglecellsamplesRequest = {
	/** Genome id */
	genome: string
	/** Dataset label */
	dslabel: string
	//filter0?: Filter0 // for gdc
}
type ValidResponse = {
	/** List of sample names with singlecell data */
	samples: Sample[]
	fields: string[]
	columnNames: string[]
	sameLegend?: boolean
}

export type TermdbSinglecellsamplesResponse = ErrorResponse | ValidResponse
