import { Genome } from '../shared/types'

export default <Genome> {
	species: 'mouse',
	genomefile: 'genomes/mm10.gz',
	genedb: {
		dbfile: 'anno/genes.mm10.db'
	},
	tracks: [
		{
			__isgene: true, // only for initialization
			translatecoding: true,
			file: 'anno/refGene.mm10.gz',
			type: 'bedj',
			name: 'RefGene',
			stackheight: 16,
			stackspace: 1,
			vpad: 4,
			color: '#1D591D'
		},
		{
			type: 'bedj',
			name: 'RepeatMasker',
			stackheight: 14,
			file: 'anno/rmsk.mm10.gz',
			onerow: true,
			categories: {
				SINE: { color: '#ED8C8E', label: 'SINE' },
				LINE: { color: '#EDCB8C', label: 'LINE' },
				LTR: { color: '#E38CED', label: 'LTR' },
				DNA: { color: '#8C8EED', label: 'DNA transposon' },
				simple: { color: '#8EB88C', label: 'Simple repeats' },
				low_complexity: { color: '#ACEBA9', label: 'Low complexity' },
				satellite: { color: '#B59A84', label: 'Satellite' },
				RNA: { color: '#9DE0E0', label: 'RNA repeat' },
				other: { color: '#9BADC2', label: 'Other' },
				unknown: { color: '#858585', label: 'Unknown' }
			}
		}
	],
	defaultcoord: {
		chr: 'chr12',
		start: 56694342,
		stop: 56713689
	},
	hicenzymefragment: [
		{
			enzyme: 'DpnII',
			file: 'anno/hicFragment/hic.DpnII.mm10.gz'
		},
		{
			enzyme: 'EcoRI',
			file: 'anno/hicFragment/hic.EcoRI.mm10.gz'
		},
		{
			enzyme: 'HindIII',
			file: 'anno/hicFragment/hic.HindIII.mm10.gz'
		},
		{
			enzyme: 'MboI',
			file: 'anno/hicFragment/hic.MboI.mm10.gz'
		},
		{
			enzyme: 'NcoI',
			file: 'anno/hicFragment/hic.NcoI.mm10.gz'
		}
	],

	majorchr: `
chr1	195471971
chr2	182113224` /* pragma: allowlist secret */ + `
chrX	171031299
chr3	160039680
chr4	156508116
chr5	151834684
chr6	149736546
chr7	145441459
chr10	130694993
chr8	129401213
chr14	124902244
chr9	124595110
chr11	122082543
chr13	120421639
chr12	120129022
chr15	104043685
chr16	98207768
chr17	94987271
chrY	91744698
chr18	90702639
chr19	61431566
chrM	16299`,
	minorchr: `
chr5_JH584299_random	953012
chrX_GL456233_random	336933
chrY_JH584301_random	259875
chr1_GL456211_random	241735
chr4_GL456350_random	227966
chr4_JH584293_random	207968
chr1_GL456221_random	206961
chr5_JH584297_random	205776
chr5_JH584296_random	199368
chr5_GL456354_random	195993
chr4_JH584294_random	191905
chr5_JH584298_random	184189
chrY_JH584300_random	182347
chr7_GL456219_random	175968
chr1_GL456210_random	169725
chrY_JH584303_random	158099
chrY_JH584302_random	155838
chr1_GL456212_random	153618
chrUn_JH584304	114452
chrUn_GL456379	72385
chr4_GL456216_random	66673
chrUn_GL456393	55711
chrUn_GL456366	47073
chrUn_GL456367	42057
chrUn_GL456239	40056
chr1_GL456213_random	39340
chrUn_GL456383	38659
chrUn_GL456385	35240
chrUn_GL456360	31704
chrUn_GL456378	31602
chrUn_GL456389	28772
chrUn_GL456372	28664
chrUn_GL456370	26764
chrUn_GL456381	25871
chrUn_GL456387	24685
chrUn_GL456390	24668
chrUn_GL456394	24323
chrUn_GL456392	23629
chrUn_GL456382	23158
chrUn_GL456359	22974
chrUn_GL456396	21240
chrUn_GL456368	20208
chr4_JH584292_random	14945
chr4_JH584295_random	1976`
}
