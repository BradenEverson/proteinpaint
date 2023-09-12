import { TermWrapper, BaseQ, Term } from '../termdb'
import { TermSettingInstance, InstanceDom } from '../termsetting'

/*
--------EXPORTED--------
NumericQ
BrushEntry
DensityData
NumberObj
NumericTW
NumericTermSettingInstance

*/

/**
 * .q{} for numeric terms
 FIXME regular-sized bin and knots (spline) are mixed in this definition and they shouldn't
 	e.g. first_bin is only required for regular-sized, and knots[] is only required for the other
 */
export type NumericQ = BaseQ & {
	// termType: 'float' | 'integer' -- converts to 'numeric'
	preferredBins?: 'median' | 'less' | 'default'

	//regular-sized bins
	bin_size: number
	startinclusive?: boolean
	stopinclusive?: boolean

	// first_bin.stop is always required
	first_bin: {
		startunbounded?: boolean
		stop: number
		//stop_percentile?: number // percentile value is not used right now
	}

	// if last_bin?.start is set, then fixed last bin is used; otherwise it's not fixed and automatic
	last_bin?: {
		start?: number
		stopunbounded?: boolean
	}

	modeBinaryCutoffType: 'normal' | 'percentile'
	modeBinaryCutoffPercentile?: number

	knots?: any //[]?

	scale?: number //0.1 | 0.01 | 0.001

	rounding: string
}

type NumObjRangeEntry = any //{}

export type BrushEntry = {
	//No documentation!
	orig: string
	range: {
		start: number
		stop: number
	}
	init: () => void
}

export type DensityData = {
	maxvalue: number
	minvalue: number
}

type PlotSize = {
	width: number
	height: number
	xpad: number
	ypad: number
}

export type NumberObj = {
	binsize_g?: any //dom element??
	brushes: BrushEntry[]
	custom_bins_q: any
	density_data: DensityData
	no_density_data: true
	plot_size: PlotSize
	ranges?: NumObjRangeEntry[]
	svg: any
	xscale: any
}

type NumericalBins = {
	label_offset?: number
	label_offset_ignored?: boolean
	rounding?: string
	default: NumericQ
	less: NumericQ
}

type NumericTerm = Term & {
	id: string
	bins: NumericalBins
	densityNotAvailable?: boolean //Not used?
}

export type NumericTW = TermWrapper & {
	q: NumericQ
	term: NumericTerm
}

type NumericDom = InstanceDom & {
	bins_div?: any
	bin_size_input: any
	bins_table?: any
	boundaryInclusionDiv: any
	boundaryInput?: any
	custom_knots_div: any
	customKnotsInput: any
	first_stop_input: any
	knots_div: any
	knot_select_div: any
	last_radio_auto: any
	last_start_input: any
}

export type NumericTermSettingInstance = TermSettingInstance & {
	dom: NumericDom
	num_obj: Partial<NumberObj>
	numqByTermIdModeType: any
	q?: Partial<NumericQ>
	term: NumericTerm
	//Methods
	renderBinLines: (self: any, q: NumericQ) => void
}
