#######################
# REGRESSION ANALYSIS
#######################

###########
# USAGE
###########

# Usage: Rscript regression.R in.json > results

# Input data is in JSON format and is read in from <in.json> file.
# Regression results are written in JSON format to stdout.

# Input JSON specifications:
# {
#   "regressionType": regression type (linear/logistic/cox)
#   "binpath": server bin path
#   "data": [{}] per-sample data values
#   "outcome": {
#     "id": variable id
#     "name": variable name
#     "rtype": type of R variable ("numeric", "factor")
#     "timeToEvent": {} (only for cox outcome)
#       "timeScale": time/age
#       "timeId": id of time variable (for 'time' time scale)
#       "agestartId": id of age start variable (for 'age' time scale)
#       "ageendId": id of age end variable (for 'age' time scale)
#       "eventId": id of event variable
#     "categories": {} (only for logistic outcome)
#       "ref": reference category of outcome
#       "nonref": non-reference category of outcome
#   }
#   "independent": [
#     {
#       "id": variable id
#       "name": variable name
#       "type": type of independent variable ("snplst", "snplocus", "spline", "other")
#       "rtype": type of R variable ("numeric", "factor")
#       "refGrp": reference group
#       "interactions": [] ids of interacting variables (optional)
#       "spline": {} cubic spline settings (only for spline variable)
#         "knots": [] knot values
#         "plotfile": output png file of spline plot
#     }
#   ]
# }
#
#
# Output JSON specifications:
# [{
#   data: {
#     "id": id of snplocus term (empty when no snplocus terms are present)
#     "data": {
#       "sampleSize": sample size of analysis,
#       "eventCnt": number of events (only for cox regression),
#       "residuals": { "header": [], "rows": [] },
#       "coefficients": { "header": [], "rows": [] },
#       "type3": { "header": [], "rows": [] },
#       "totalSnpEffect": { "header": [], "rows": [] } (only for snplocus interactions),
#       "tests": { "header": [], "rows": [] } (only for cox regression),
#       "other": { "header": [], "rows": [] },
#       "warnings": [] warning messages
#     },
#   }
#   benchmark: {} benchmarking results
# }]


###########
# CODE
###########

suppressPackageStartupMessages({
  library(jsonlite)
  library(survival)
  library(parallel)
  library(lmtest)
})

args <- commandArgs(trailingOnly = T)
if (length(args) != 1) stop("Usage: Rscript regression.R in.json > results")
infile <- args[1]

benchmark <- list()


################
# PREPARE DATA #
################

# read in json input
stime <- Sys.time()
input <- fromJSON(infile)
etime <- Sys.time()
dtime <- etime - stime
benchmark[["read_json_input"]] <- unbox(paste(round(as.numeric(dtime), 4), attr(dtime, "units")))

# import regression utilities
source(paste0(input$binpath, "/utils/regression.utils.R"))

# prepare data table
stime <- Sys.time()
dat <- prepareDataTable(input$data, input$independent)
etime <- Sys.time()
dtime <- etime - stime
benchmark[["prepareDataTable"]] <- unbox(paste(round(as.numeric(dtime), 4), attr(dtime, "units")))


##################
# BUILD FORMULAS #
##################

stime <- Sys.time()
formulas <- buildFormulas(input$outcome, input$independent)
etime <- Sys.time()
dtime <- etime - stime
benchmark[["buildFormulas"]] <- unbox(paste(round(as.numeric(dtime), 4), attr(dtime, "units")))


#save.image("~/test.RData")
#stop("stop here")

##################
# RUN REGRESSION #
##################

# run a separate regression analysis for each formula
# run the analyses in parallel using multiple cores
stime <- Sys.time()
cores <- detectCores()
if (is.na(cores)) stop("unable to detect number of cores")
reg_results <- mclapply(X = formulas, FUN = runRegression, regtype = input$regressionType, dat = dat, outcome = input$outcome, mc.cores = cores)
etime <- Sys.time()
dtime <- etime - stime
benchmark[["runRegression"]] <- unbox(paste(round(as.numeric(dtime), 4), attr(dtime, "units")))

out <- list(data = reg_results, benchmark = benchmark)


##################
# EXPORT RESULTS #
##################

# Export results as json to stdout
toJSON(out, digits = NA, na = "string")