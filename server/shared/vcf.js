import { mclass } from './common'
import { dissect_INFO } from './vcf.info'
import { parse_CSQ } from './vcf.csq'
import { parse_ANN } from './vcf.ann'
import { getVariantType } from './vcf.type'

/*
Only for parsing vcf files
is not involved in creating vcf tracks

shared between client-server
*/

// for telling symbolic alleles e.g. <*:DEL>
const getallelename = new RegExp(/<(.+)>/)

const mclasslabel2key = {}
for (const k in mclass) {
	mclasslabel2key[mclass[k].label.toUpperCase()] = k
}

export function vcfparsemeta(lines) {
	/*
	input: array of string, as lines separated by linebreak

	##INFO for meta lines
	#CHROM for header, to get samples

	*/

	let sample = [],
		errlst = [],
		info = {},
		hasinfo = false,
		format = {},
		hasformat = false

	for (const line of lines) {
		if (!line.startsWith('#')) {
			continue
		}

		if (line.startsWith('#C')) {
			// header, get samples
			sample = line.split('\t').slice(9)
			continue
		}

		if (line.startsWith('##INFO')) {
			const e = tohash(line.substring(8, line.length - 1), info)
			if (e) {
				errlst.push('INFO error: ' + e)
			} else {
				hasinfo = true
			}
			continue
		}

		if (line.startsWith('##FORMAT')) {
			const e = tohash(line.substring(10, line.length - 1), format)
			if (e) {
				errlst.push('FORMAT error: ' + e)
			} else {
				hasformat = true
			}
		}
	}

	const sampleobjlst = []
	for (const samplename of sample) {
		const a = { name: samplename }

		// this enables adding key4annotation to match with .ds.cohort.annotation

		sampleobjlst.push(a)
	}

	// reserved INFO fields
	if (info.CSQ) {
		const lst = info.CSQ.Description.split(' Format: ')
		if (lst[1]) {
			const lst2 = lst[1].split('|')
			if (lst2.length > 1) {
				// fix csq headers so to allow configuring show/hide of csq fields
				info.CSQ.csqheader = []
				for (const str of lst2) {
					const attr = { name: str }
					info.CSQ.csqheader.push(attr)
				}
			} else {
				errlst.push('unknown format for CSQ header: ' + info.CSQ.Description)
			}
		} else {
			errlst.push('unknown format for CSQ header: ' + info.CSQ.Description)
		}
	}

	if (info.ANN) {
		const lst = info.ANN.Description.split("'")
		if (lst[1]) {
			const lst2 = lst[1].split(' | ')
			if (lst2.length) {
				info.ANN.annheader = []
				for (const s of lst2) {
					const attr = { name: s }
					info.ANN.annheader.push(attr)
				}
			} else {
				errlst.push('no " | " joined annotation fields for ANN (snpEff annotation): ' + info.ANN.Description)
			}
		} else {
			errlst.push('no single-quote enclosed annotation fields for ANN (snpEff annotation): ' + info.ANN.Description)
		}
	}

	return [hasinfo ? info : null, hasformat ? format : null, sampleobjlst, errlst.length ? errlst : null]
}

export function vcfparseline(line, vcf) {
	/*
	vcf, samples/info is generated by vcfparsemeta()
		.nochr BOOL
		.samples [ {} ]
			.name
		.info {}
		.format {}

	return:
		error message STR
		altinvalid []
		mlst [ m ]   one m per alt allele
			chr
			pos
			name
			type
			ref
			alt
			altstr
			sampledata []
			altinfo
	*/

	const lst = line.split('\t')
	if (lst.length < 8) {
		// no good
		return ['line has less than 8 fields', null, null]
	}

	const rawpos = Number.parseInt(lst[2 - 1])
	if (!Number.isInteger(rawpos)) {
		return ['invalid value for genomic position', null, null]
	}

	const refallele = lst[4 - 1]

	const m = {
		vcf_ID: lst[3 - 1],
		chr: (vcf.nochr ? 'chr' : '') + lst[1 - 1],
		pos: rawpos - 1,
		ref: refallele,
		//refstr:refallele, // e.g. GA>GCC, ref:A, refstr:GA, "refstr" is required for matching in FORMAT
		altstr: lst[5 - 1],
		alleles: [
			{
				/*
				ref allele only a placeholder, to be removed, this array only contains alt alleles
				this is a must
				also allows GT allele index to work
				*/
				allele: refallele,
				sampledata: []
			}
		],

		info: {}, // locus info, do not contain allele info

		name: lst[3 - 1] == '.' ? null : lst[3 - 1]
	}

	// parse alt
	const altinvalid = []
	for (const alt of lst[5 - 1].split(',')) {
		const a = {
			ref: m.ref, // may be corrected just below!
			allele: alt,
			// 5078356.TATCAGAGAA.GGGAGGA keep original allele for matching with csq which hardcodes original allele
			allele_original: alt,
			sampledata: [],
			_m: m,
			info: {} // allele info, do not contain locus info
		}
		m.alleles.push(a)
		if (alt[0] == '<') {
			/*
			symbolic allele, show text within <> as name
			FIXME match INFO
			*/
			const tmp = alt.match(getallelename)
			if (!tmp) {
				altinvalid.push(alt)
				continue
			}
			a.type = tmp[1]

			a.allele = tmp[1]
			a.issymbolicallele = true
		} else {
			// normal nucleotide

			const [p, ref, alt] = correctRefAlt(m.pos, m.ref, a.allele)
			a.pos = p
			a.ref = ref
			a.allele = alt
		}
	}

	if (lst[9 - 1] && lst[10 - 1]) {
		parse_FORMAT2(lst, m, vcf)
	}

	/*
	remove ref allele so it only contain alternative alleles
	so that parse_INFO can safely apply Number=A fields to m.alleles
	*/
	m.alleles.shift()

	// info
	const tmp = lst[8 - 1] == '.' ? [] : dissect_INFO(lst[8 - 1])
	let badinfokeys = []

	if (vcf.info) {
		badinfokeys = parse_INFO(tmp, m, vcf)
	} else {
		// vcf meta lines told nothing about INFO, do not parse
		m.info = tmp
	}

	const mlst = []
	for (const a of m.alleles) {
		const m2 = {}
		for (const k in m) {
			if (k != 'alleles') {
				m2[k] = m[k]
			}
		}
		for (const k in a) {
			if (k == 'allele') {
				m2.alt = a[k]
			} else if (k == 'info') {
				m2.altinfo = a[k]
			} else {
				m2[k] = a[k]
			}
		}
		if (!m2.issymbolicallele && m2.alt != 'NON_REF') {
			m2.type = getVariantType(m2.ref, m2.alt)
			/*
			// valid alt allele, apply Dr. J's cool method
			const [p,ref,alt]=correctRefAlt(m2.pos, m2.ref, m2.alt)
			m2.pos=p
			m2.ref=ref
			m2.alt=alt
			*/
		}
		mlst.push(m2)
	}
	return [
		badinfokeys.length ? 'unknown info keys: ' + badinfokeys.join(',') : null,
		mlst,
		altinvalid.length > 0 ? altinvalid : null
	]
}

function correctRefAlt(p, ref, alt) {
	// for oligos, always trim the last identical base
	while (ref.length > 1 && alt.length > 1 && ref[ref.length - 1] == alt[alt.length - 1]) {
		ref = ref.substr(0, ref.length - 1)
		alt = alt.substr(0, alt.length - 1)
	}
	// move position up as long as first positions are equal
	while (ref.length > 1 && alt.length > 1 && ref[0] == alt[0]) {
		ref = ref.substr(1)
		alt = alt.substr(1)
		p++
	}
	return [p, ref, alt]
}

function parse_FORMAT2(lst, m, vcf) {
	/*
	m.alleles[0] is ref allele

	each allele:
		.ref
		.allele
		.allele_original
		.sampledata[]     blank array
	*/
	const formatfields = lst[9 - 1].split(':')

	for (let _sampleidx = 9; _sampleidx < lst.length; _sampleidx++) {
		// for each sample

		const valuelst = lst[_sampleidx].split(':')
		{
			// tell if this sample have any data in this line (variant), if .:., then skip
			let none = true
			for (const v of valuelst) {
				if (v != '.') {
					none = false
					break
				}
			}
			if (none) {
				// this sample has no format value
				continue
			}
		}

		/* should create an object of {format:value} of this sample
		with this object, for each alt allele this sample has,
		put a copy in m.allele[x].sampledata[]
		*/

		const sampleidx = _sampleidx - 9

		/*
		for each alt allele, initialize obj of this sample and store in this allele
		later, to iterate over format fields and put in appropriate values
		note that this sample may not actually have this allele
		*/
		for (let i = 1; i < m.alleles.length; i++) {
			const sobj = {}
			if (vcf.samples && vcf.samples[sampleidx]) {
				for (const k in vcf.samples[sampleidx]) {
					sobj[k] = vcf.samples[sampleidx][k]
				}
			} else {
				sobj.name = 'missing_samplename_from_vcf_header'
			}
			m.alleles[i].sampledata.push({
				sampleobj: sobj
			})
		}

		for (let fi = 0; fi < formatfields.length; fi++) {
			// for each field of this sample

			const field = formatfields[fi]
			const value = valuelst[fi]
			if (value == '.') {
				// no value for this field
				continue
			}

			if (field == 'GT') {
				const splitter = value.indexOf('/') != -1 ? '/' : '|'
				let gtsum = 0 // for calculating gtallref=true, old
				let unknowngt = false // if any is '.', then won't calculate gtallref
				const gtalleles = []
				for (const i of value.split(splitter)) {
					if (i == '.') {
						unknowngt = true
						continue
					}
					const j = Number.parseInt(i)
					if (Number.isNaN(j)) {
						unknowngt = true
						continue
					}
					gtsum += j
					const ale = m.alleles[j]
					if (ale) {
						gtalleles.push(ale.allele)
					}
				}
				let gtallref = false
				if (!unknowngt) {
					gtallref = gtsum == 0
				}

				const genotype = gtalleles.join(splitter)
				for (let i = 1; i < m.alleles.length; i++) {
					const ms = m.alleles[i].sampledata[m.alleles[i].sampledata.length - 1]
					ms.GT = value
					ms.genotype = genotype
					if (gtallref) {
						ms.gtallref = true
					}

					// for mds vcf to drop out samples that do not have this alt allele
					ms.__gtalleles = gtalleles
				}
				continue
			}

			// other data fields
			const formatdesc = vcf.format ? vcf.format[field] : null
			if (!formatdesc) {
				// unspecified field, put to all alt alleles
				for (let i = 1; i < m.alleles.length; i++) {
					m.alleles[i].sampledata[m.alleles[i].sampledata.length - 1][field] = value
				}
				continue
			}

			const isinteger = formatdesc.Type == 'Integer'
			const isfloat = formatdesc.Type == 'Float'

			if ((formatdesc.Number && formatdesc.Number == 'R') || field == 'AD') {
				/*
				per-allele value, including ref
				v4.1 has AD not with "R", must process as R
				*/
				const fvlst = value.split(',').map(i => {
					if (isinteger) return Number.parseInt(i)
					if (isfloat) return Number.parseFloat(i)
					return i
				})
				for (let i = 1; i < m.alleles.length; i++) {
					if (fvlst[i] != undefined) {
						// this allele has value
						const m2 = m.alleles[i]
						const m2s = m2.sampledata[m2.sampledata.length - 1]
						// use this allele's ref/alt (after nt trimming)
						m2s[field] = {}
						m2s[field][m2.ref] = fvlst[0]
						m2s[field][m2.allele] = fvlst[i]
					}
				}
				continue
			}
			if (formatdesc.Number && formatdesc.Number == 'A') {
				// per alt-allele value
				const fvlst = value.split(',').map(i => {
					if (isinteger) return Number.parseInt(i)
					if (isfloat) return Number.parseFloat(i)
					return i
				})
				for (let i = 1; i < m.alleles.length; i++) {
					if (fvlst[i - 1] != undefined) {
						// this allele has value
						const m2 = m.alleles[i]
						const m2s = m2.sampledata[m2.sampledata.length - 1]
						// use this allele's ref/alt (after nt trimming)
						m2s[field] = {}
						m2s[field][m2.allele] = fvlst[i - 1]
					}
				}
				continue
			}
			// otherwise, append this field to all alt
			for (let i = 1; i < m.alleles.length; i++) {
				m.alleles[i].sampledata[m.alleles[i].sampledata.length - 1][field] = value
			}
		}
	}

	// compatible with old ds: make allele2readcount from AD
	for (const a of m.alleles) {
		for (const s of a.sampledata) {
			if (s.AD) {
				s.allele2readcount = {}
				for (const k in s.AD) {
					s.allele2readcount[k] = s.AD[k]
				}
			}
		}
	}
}

function tohash(s, hash) {
	/*
	parse INFO
	*/
	const h = {},
		err = []
	let prev = 0,
		prevdoublequote = false,
		k = null
	for (let i = 0; i < s.length; i++) {
		if (s[i] == '"') {
			i++
			const thisstart = i
			while (s[i] != '"') {
				i++
			}
			if (k) {
				h[k] = s.substring(thisstart, i)
				k = null
			} else {
				err.push('k undefined before double quotes')
			}
			prevdoublequote = true
			continue
		}
		if (s[i] == '=') {
			k = s.substring(prev, i)
			prev = i + 1
			continue
		}
		if (s[i] == ',') {
			if (prevdoublequote) {
				prevdoublequote = false
			} else {
				if (k) {
					h[k] = s.substring(prev, i)
					k = null
				} else {
					err.push('k undefined')
				}
			}
			prev = i + 1
			continue
		}
	}
	if (k) {
		h[k] = s.substring(prev, i)
	}
	if (h.ID) {
		hash[h.ID] = h
	} else {
		return 'no ID'
	}
	if (err.length) return err.join('\n')
}

function parse_INFO(tmp, m, vcf) {
	/*
	this function fills in both m.info{} and m.alleles[].info{}

	the m.alleles[] will later be converted to [m], each carrying one alt allele
	each m will have .info{} for locus info, and .altinfo{} for alt allele info

	*/

	const badinfokeys = []

	for (const key in tmp) {
		if (vcf.info[key] == undefined) {
			badinfokeys.push(key)
			continue
		}

		const value = tmp[key]

		////////////////// hard-coded fields

		if (key == 'CSQ') {
			const okay = parse_CSQ(value, vcf.info.CSQ.csqheader, m)
			if (!okay) {
				m.info[key] = value
			}
			continue
		}
		if (key == 'ANN') {
			const okay = parse_ANN(value, vcf.info.ANN.annheader, m)
			if (!okay) {
				m.info[key] = value
			}
			continue
		}

		////////////////// end of hardcoded fields

		if (vcf.info[key].Type == 'Flag') {
			// flag has no value
			m.info[key] = key
			continue
		}

		const __number = vcf.info[key].Number
		const isinteger = vcf.info[key].Type == 'Integer'
		const isfloat = vcf.info[key].Type == 'Float'

		if (__number == '0') {
			/*
			no value, should be a Flag
			*/
			m.info[key] = key
			continue
		}

		if (__number == 'A') {
			/*
			per alt allele
			*/
			const tt = value.split(',')
			for (let j = 0; j < tt.length; j++) {
				if (m.alleles[j]) {
					m.alleles[j].info[key] = isinteger ? Number.parseInt(tt[j]) : isfloat ? Number.parseFloat(tt[j]) : tt[j]
				}
			}
			continue
		}

		if (__number == 'R') {
			/*
			FIXME "R" is not considered, m.alleles only contain alt, which .info{} for each
			the current datastructure does not support info for ref allele!
			*/
		}

		if (__number == '1') {
			/*
			single value
			*/
			m.info[key] = isinteger ? Number.parseInt(value) : isfloat ? Number.parseFloat(value) : value
			continue
		}

		if (!value.split) {
			// unknown error
			continue
		}

		// number of values unknown, "commas are permitted only as delimiters for lists of values"

		const lst = value.split(',') // value is always array!!
		if (isinteger) {
			m.info[key] = lst.map(Number.parseInt)
		} else if (isfloat) {
			m.info[key] = lst.map(Number.parseFloat)
		} else {
			m.info[key] = lst
		}
	}
	return badinfokeys
}
