#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import mdnData from "mdn-data";
import cssShorthandProperties from "css-shorthand-properties";

const DEFAULT_FORMAT = "markdown";
const properties = mdnData.css.properties;
const shorthandApi = cssShorthandProperties?.default ?? cssShorthandProperties;
const args = parseArgs(process.argv.slice(2));

process.stdout.on("error", (error) => {
	if (error && error.code === "EPIPE") {
		process.exit(0);
	}
	throw error;
});

if (args.help) {
	printHelp();
	process.exit(0);
}

const report = buildReport(properties, {
	includeNonStandard: args.includeNonStandard,
	all: args.all,
});

const output = args.format === "json" ? JSON.stringify(report, null, 2) : renderMarkdown(report, args.all);

if (args.out) {
	const outPath = path.resolve(process.cwd(), args.out);
	fs.mkdirSync(path.dirname(outPath), { recursive: true });
	fs.writeFileSync(outPath, output, "utf8");
	console.log(`Wrote ${outPath}`);
} else {
	process.stdout.write(output);
	if (!output.endsWith("\n")) {
		process.stdout.write("\n");
	}
}

function parseArgs(argv) {
	const options = {
		format: DEFAULT_FORMAT,
		all: false,
		includeNonStandard: false,
		out: "",
		help: false,
	};

	for (let index = 0; index < argv.length; ++index) {
		const arg = argv[index];
		switch (arg) {
			case "--json":
				options.format = "json";
				break;
			case "--markdown":
				options.format = "markdown";
				break;
			case "--all":
				options.all = true;
				break;
			case "--include-nonstandard":
				options.includeNonStandard = true;
				break;
			case "--standard-only":
				options.includeNonStandard = false;
				break;
			case "--out":
				if (index + 1 >= argv.length) {
					throw new Error("--out expects a file path");
				}
				options.out = argv[++index];
				break;
			case "--help":
			case "-h":
				options.help = true;
				break;
			default:
				throw new Error(`Unknown argument: ${arg}`);
		}
	}

	return options;
}

function printHelp() {
	console.log(`Analyze MDN CSS property metadata.

Usage:
  node scripts/analyze-mdn-css-properties.mjs [options]

Options:
  --markdown              Render markdown output (default)
  --json                  Render JSON output
  --all                   Include the full property catalog in markdown output
  --include-nonstandard   Include non-standard properties
  --standard-only         Exclude non-standard properties (default)
  --out <file>            Write output to a file
  --help, -h              Show this help
`);
}

function buildReport(allProperties, options) {
	const entries = [];
	const buckets = new Map();
	const groupCounts = new Map();
	let standardCount = 0;
	let nonStandardCount = 0;

	for (const [name, meta] of Object.entries(allProperties)) {
		if (!options.includeNonStandard && meta.status !== "standard") {
			continue;
		}

		if (meta.status === "standard") {
			++standardCount;
		} else {
			++nonStandardCount;
		}

		const info = analyzeProperty(name, meta);
		entries.push(info);

		buckets.set(info.bucket, (buckets.get(info.bucket) ?? 0) + 1);
		for (const group of info.groups) {
			groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);
		}
	}

	entries.sort((left, right) => left.name.localeCompare(right.name));
	for (const entry of entries) {
		const conservative = classifyConservative(entry);
		entry.conservative = conservative.kind;
		entry.conservativeReason = conservative.reason;
	}

	const shorthandFamilies = entries
		.filter((entry) => entry.shorthandMembers.length > 0)
		.sort(
			(left, right) =>
				right.shorthandMembers.length - left.shorthandMembers.length || left.name.localeCompare(right.name),
		);

	const mdnCompositeFamilies = entries
		.filter((entry) => entry.familyMembers.length > 1)
		.sort(
			(left, right) => right.familyMembers.length - left.familyMembers.length || left.name.localeCompare(right.name),
		);

	const genericSingles = entries.filter((entry) => entry.bucket === "generic-single");
	const keywordUnions = entries.filter((entry) => entry.bucket === "keyword-union");
	const mixed = entries.filter((entry) => entry.bucket === "mixed");
	const repeats = entries.filter((entry) => entry.bucket === "repeatable");
	const others = entries.filter((entry) => entry.bucket === "other");
	const conservativeSafe = entries
		.filter((entry) => entry.conservative === "safe")
		.sort((left, right) => left.name.localeCompare(right.name));
	const conservativeDeferred = entries
		.filter((entry) => entry.conservative === "defer")
		.sort((left, right) => left.name.localeCompare(right.name));
	const conservativeSuppressed = entries
		.filter((entry) => entry.conservative === "suppress")
		.sort((left, right) => left.name.localeCompare(right.name));

	const topGroups = [...groupCounts.entries()]
		.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
		.slice(0, 12)
		.map(([group, count]) => ({ group, count }));

	return {
		summary: {
			total: entries.length,
			standard: standardCount,
			nonStandard: nonStandardCount,
			buckets: Object.fromEntries([...buckets.entries()].sort(([left], [right]) => left.localeCompare(right))),
			topGroups,
		},
		shorthandFamilies,
		mdnCompositeFamilies,
		genericSingles,
		keywordUnions,
		mixed,
		repeats,
		others,
		conservativeSafe,
		conservativeDeferred,
		conservativeSuppressed,
		properties: options.all ? entries : undefined,
	};
}

function analyzeProperty(name, meta) {
	const syntax = typeof meta.syntax === "string" ? meta.syntax : "";
	const syntaxInfo = classifySyntax(syntax);
	const shorthandMembers = isShorthand(name) ? expandShorthand(name) : [];
	const familyMembers = uniqueStrings([...extractNameList(meta.initial), ...extractNameList(meta.computed)]).filter(
		(member) => member !== name,
	);

	return {
		name,
		status: meta.status ?? "",
		inherited: Boolean(meta.inherited),
		media: meta.media ?? "",
		animationType: formatValue(meta.animationType),
		percentages: formatValue(meta.percentages),
		initial: formatValue(meta.initial),
		computed: formatValue(meta.computed),
		appliesto: meta.appliesto ?? "",
		groups: Array.isArray(meta.groups) ? [...meta.groups] : [],
		mdnUrl: meta.mdn_url ?? "",
		syntax,
		bucket: classifyBucket({ shorthandMembers, syntaxInfo }),
		shorthandMembers,
		familyMembers,
		syntaxInfo,
		conservative: "",
		conservativeReason: "",
	};
}

function classifyBucket({ shorthandMembers, syntaxInfo }) {
	if (shorthandMembers.length > 0) {
		return "shorthand-family";
	}
	if (syntaxInfo.propertyRefs.length > 0 && syntaxInfo.genericTokens.length === 0 && !syntaxInfo.hasPipe) {
		return syntaxInfo.hasRepeat ? "reference-repeat" : "property-reference";
	}
	if (syntaxInfo.genericTokens.length > 0 && syntaxInfo.hasPipe) {
		return "mixed";
	}
	if (syntaxInfo.hasPipe) {
		return "keyword-union";
	}
	if (syntaxInfo.hasRepeat) {
		return syntaxInfo.propertyRefs.length > 0 ? "reference-repeat" : "repeatable";
	}
	if (syntaxInfo.genericTokens.length > 0) {
		return "generic-single";
	}
	if (syntaxInfo.propertyRefs.length > 0) {
		return "property-reference";
	}
	if (syntaxInfo.literalTokens.length > 0) {
		return "literal";
	}
	return "other";
}

function isShorthand(name) {
	return Boolean(shorthandApi && typeof shorthandApi.isShorthand === "function" && shorthandApi.isShorthand(name));
}

function expandShorthand(name) {
	if (!shorthandApi || typeof shorthandApi.expand !== "function") {
		return [];
	}
	const expanded = shorthandApi.expand(name);
	return Array.isArray(expanded) ? expanded.filter((entry) => typeof entry === "string") : [];
}

function classifyConservative(entry) {
	if (isConservativeSafe(entry)) {
		return {
			kind: "safe",
			reason: "shorthand with repeated-value syntax and no alternation; safe for a first-pass hint candidate",
		};
	}

	if (entry.shorthandMembers.length > 0) {
		return {
			kind: "defer",
			reason: "recognized shorthand family, but the syntax is more complex than the conservative first-pass rule",
		};
	}

	return {
		kind: "suppress",
		reason: "no conservative semantic gain yet; keep it out of the first-pass hint set",
	};
}

function isConservativeSafe(entry) {
	return entry.shorthandMembers.length > 0 && entry.syntaxInfo.hasRepeat && !entry.syntaxInfo.hasPipe;
}

function classifySyntax(syntax) {
	const trimmed = syntax.trim();
	const angleTokens = [...trimmed.matchAll(/<([^>]+)>/g)].map((match) => match[1].trim());
	const propertyRefs = angleTokens.filter((token) => /^'[^']+'$/.test(token)).map((token) => token.slice(1, -1));
	const genericTokens = angleTokens.filter((token) => !/^'[^']+'$/.test(token));
	const hasPipe = trimmed.includes("|");
	const hasRepeat = /\{\s*\d+\s*(?:,\s*\d*)?\s*\}/.test(trimmed);
	const literalTokens = extractLiteralTokens(trimmed, angleTokens);

	return {
		angleTokens,
		propertyRefs,
		genericTokens,
		literalTokens,
		hasPipe,
		hasRepeat,
	};
}

function extractLiteralTokens(syntax, angleTokens) {
	const withoutAngles = syntax.replace(/<[^>]+>/g, " ");
	const parts = withoutAngles
		.split("|")
		.map((part) => part.trim())
		.filter(Boolean)
		.filter((part) => part !== "?" && part !== "+" && part !== "*");
	const literals = [];
	for (const part of parts) {
		const tokens = part
			.split(/\s+/)
			.map((token) => token.trim())
			.filter(Boolean)
			.filter((token) => !/^[{}()?,]+$/.test(token));
		for (const token of tokens) {
			if (!token.startsWith('"') && !token.startsWith("'") && !angleTokens.includes(token)) {
				literals.push(token);
			}
		}
	}
	return uniqueStrings(literals);
}

function extractNameList(value) {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((entry) => typeof entry === "string");
}

function formatValue(value) {
	if (Array.isArray(value)) {
		return value.join(", ");
	}
	return value ?? "";
}

function uniqueStrings(values) {
	return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))];
}

function renderMarkdown(report, includeAllProperties) {
	const lines = [];
	lines.push("# MDN CSS property analysis");
	lines.push("");
	lines.push(`- Total properties analyzed: ${report.summary.total}`);
	lines.push(`- Standard properties: ${report.summary.standard}`);
	lines.push(`- Non-standard properties: ${report.summary.nonStandard}`);
	lines.push("");
	lines.push("## Bucket summary");
	lines.push("");
	for (const [bucket, count] of Object.entries(report.summary.buckets)) {
		lines.push(`- ${bucket}: ${count}`);
	}
	lines.push("");
	lines.push("## Top groups");
	lines.push("");
	for (const { group, count } of report.summary.topGroups) {
		lines.push(`- ${group}: ${count}`);
	}
	lines.push("");
	lines.push("## Shorthand families");
	lines.push("");
	lines.push(renderPropertyTable(report.shorthandFamilies, ["name", "shorthandMembers", "syntax", "bucket", "status"]));
	lines.push("");
	lines.push("## MDN-derived composite families");
	lines.push("");
	lines.push(renderPropertyTable(report.mdnCompositeFamilies, ["name", "familyMembers", "syntax", "bucket", "status"]));
	lines.push("");
	lines.push("## Conservative classification");
	lines.push("");
	lines.push(`- safe: ${report.conservativeSafe.length}`);
	lines.push(`- defer: ${report.conservativeDeferred.length}`);
	lines.push(`- suppress: ${report.conservativeSuppressed.length}`);
	lines.push("");
	lines.push("### Safe candidates");
	lines.push("");
	lines.push(
		renderPropertyTable(report.conservativeSafe, [
			"name",
			"syntax",
			"shorthandMembers",
			"bucket",
			"status",
			"conservativeReason",
		]),
	);
	lines.push("");
	lines.push("### Deferred candidates");
	lines.push("");
	lines.push(
		renderPropertyTable(report.conservativeDeferred, ["name", "syntax", "bucket", "status", "conservativeReason"]),
	);
	lines.push("");
	lines.push("### Suppressed candidates");
	lines.push("");
	lines.push(
		renderPropertyTable(report.conservativeSuppressed.slice(0, 80), [
			"name",
			"syntax",
			"bucket",
			"status",
			"conservativeReason",
		]),
	);
	lines.push("");
	lines.push("## Generic single-token candidates");
	lines.push("");
	lines.push(renderPropertyTable(report.genericSingles, ["name", "syntax", "bucket", "status", "groups"]));
	lines.push("");
	lines.push("## Keyword unions");
	lines.push("");
	lines.push(renderPropertyTable(report.keywordUnions, ["name", "syntax", "bucket", "status", "groups"]));
	lines.push("");
	lines.push("## Mixed syntax");
	lines.push("");
	lines.push(renderPropertyTable(report.mixed, ["name", "syntax", "bucket", "status", "groups"]));
	lines.push("");
	lines.push("## Repeatable syntax");
	lines.push("");
	lines.push(renderPropertyTable(report.repeats, ["name", "syntax", "bucket", "status", "groups"]));
	lines.push("");
	lines.push("## Other");
	lines.push("");
	lines.push(renderPropertyTable(report.others, ["name", "syntax", "bucket", "status", "groups"]));
	if (includeAllProperties && Array.isArray(report.properties)) {
		lines.push("");
		lines.push("## Full catalog");
		lines.push("");
		lines.push(
			renderPropertyTable(report.properties, [
				"name",
				"bucket",
				"syntax",
				"status",
				"inherited",
				"groups",
				"shorthandMembers",
				"familyMembers",
			]),
		);
	}
	return lines.join("\n");
}

function renderPropertyTable(entries, columns) {
	if (!entries.length) {
		return "_None_";
	}
	const header = `| ${columns.join(" | ")} |`;
	const separator = `| ${columns.map(() => "---").join(" | ")} |`;
	const rows = entries.map(
		(entry) => `| ${columns.map((column) => escapeMarkdownCell(formatCell(entry[column]))).join(" | ")} |`,
	);
	return [header, separator, ...rows].join("\n");
}

function formatCell(value) {
	if (Array.isArray(value)) {
		return value.join(", ");
	}
	if (typeof value === "boolean") {
		return value ? "yes" : "no";
	}
	if (value == null) {
		return "";
	}
	if (typeof value === "object") {
		return JSON.stringify(value);
	}
	return String(value);
}

function escapeMarkdownCell(text) {
	return text.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}
