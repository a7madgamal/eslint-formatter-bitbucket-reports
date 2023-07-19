"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const eslint_formatter_stylish_1 = __importDefault(require("eslint-formatter-stylish"));
const got_1 = __importDefault(require("got"));
const BITBUCKET_WORKSPACE = getEnv("BITBUCKET_WORKSPACE"); //"curalie";
const BITBUCKET_REPO_SLUG = getEnv("BITBUCKET_REPO_SLUG"); //"tnp-chameleon";
const BITBUCKET_COMMIT = getEnv("BITBUCKET_COMMIT"); //"919db18";
const BITBUCKET_API_AUTH = getEnv("BITBUCKET_API_AUTH");
const MAX_ANNOTATIONS_PER_REQUEST = 100;
const httpClient = got_1.default.extend({
    prefixUrl: `https://api.bitbucket.org/2.0`,
    responseType: "json",
    headers: {
        Authorization: `Bearer ${BITBUCKET_API_AUTH}`,
        "Content-Type": "application/json",
        Accept: "application/json",
    },
});
var SEVERITIES;
(function (SEVERITIES) {
    SEVERITIES["MEDIUM"] = "MEDIUM";
    SEVERITIES["HIGH"] = "HIGH";
})(SEVERITIES || (SEVERITIES = {}));
function generateReport(results) {
    const summary = results.reduce((acc, current) => {
        acc.errorCount += current.errorCount;
        acc.warningCount += current.warningCount;
        return acc;
    }, { errorCount: 0, warningCount: 0 });
    const { errorCount, warningCount } = summary;
    const problemCount = errorCount + warningCount;
    const details = `${problemCount} problem${problemCount !== 1 ? "s" : ""} (${errorCount} error${errorCount !== 1 ? "s" : ""}, ${warningCount} warning${warningCount !== 1 ? "s" : ""})`;
    const result = errorCount > 0 ? "FAILED" : "PASSED";
    return {
        title: "ESLint Bitbucket reporter",
        reporter: "ESLint",
        report_type: "TEST",
        details,
        result,
    };
}
function generateAnnotations(results, reportId) {
    const result = results.reduce((acc, result) => {
        const relativePath = path_1.default.relative(process.cwd(), result.filePath);
        return [
            ...acc,
            ...result.messages.map((messageObject, i) => {
                const { line, message, severity, ruleId } = messageObject;
                const external_id = `${reportId}-${relativePath}-${line}-${ruleId}-${i}`;
                const result = {
                    external_id,
                    line,
                    path: relativePath,
                    summary: `${message.substring(400)} (${ruleId})`,
                    annotation_type: "BUG",
                    severity: severity === 1 ? SEVERITIES.MEDIUM : SEVERITIES.HIGH,
                };
                return result;
            }),
        ];
    }, []);
    return result;
}
async function deleteReport(reportId) {
    return httpClient.delete(`repositories/${BITBUCKET_WORKSPACE}/${BITBUCKET_REPO_SLUG}/commit/${BITBUCKET_COMMIT}/reports/${reportId}`);
}
async function createReport(reportId, reportData) {
    return httpClient.put(`repositories/${BITBUCKET_WORKSPACE}/${BITBUCKET_REPO_SLUG}/commit/${BITBUCKET_COMMIT}/reports/${reportId}`, {
        json: reportData,
        responseType: "json",
    });
}
async function createAnnotations(reportId, annotations) {
    const chunk = annotations.slice(0, MAX_ANNOTATIONS_PER_REQUEST);
    const response = await httpClient.post(`repositories/${BITBUCKET_WORKSPACE}/${BITBUCKET_REPO_SLUG}/commit/${BITBUCKET_COMMIT}/reports/${reportId}/annotations`, {
        json: chunk,
        responseType: "json",
    });
    if (annotations.length > MAX_ANNOTATIONS_PER_REQUEST) {
        return createAnnotations(reportId, annotations.slice(MAX_ANNOTATIONS_PER_REQUEST));
    }
    return response;
}
async function processResults(results) {
    const reportId = `eslint-${BITBUCKET_COMMIT}`;
    const report = generateReport(results);
    const annotations = generateAnnotations(results, reportId);
    try {
        console.log("✍🏼 Deleting previous report...");
        await deleteReport(reportId);
        console.log("✅ Previous report deleted!");
    }
    catch (error) {
        console.log("❌ Report deletion failed!");
        if (error.response) {
            console.error(error.message, error.response.body);
        }
        else {
            console.error(error);
        }
        throw error;
    }
    try {
        console.log("✍🏼 Creating a new report...");
        await createReport(reportId, report);
        console.log("✅ New report created");
    }
    catch (error) {
        console.log("❌ Report creation failed");
        if (error.response) {
            console.error(error.message, error.response.body);
        }
        else {
            console.error(error);
        }
        throw error;
    }
    try {
        if (annotations.length > 0) {
            console.log("✍🏼 Adding new annotations...");
            await createAnnotations(reportId, annotations);
            console.log("✅ Annotations added!");
        }
        else {
            console.log("⚠️ no annotations found!", annotations);
        }
    }
    catch (error) {
        console.log("❌ Annotations adding failed!");
        // if (error.request) {
        //   console.log(error.request.options);
        // }
        if (error.response) {
            console.error(error.message, error.response.body);
        }
        else {
            console.error(error);
        }
        throw error;
    }
}
function getEnv(key) {
    const test = process.env[key];
    if (!test) {
        throw new Error(`Missing ENV var: [${key}]`);
    }
    return test;
}
module.exports = function (results) {
    processResults(results);
    // @ts-expect-error wrong 3rd party type
    return (0, eslint_formatter_stylish_1.default)(results);
};
//# sourceMappingURL=index.js.map