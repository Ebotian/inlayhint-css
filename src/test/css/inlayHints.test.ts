"use strict";

import { suite, test } from "node:test";
import * as assert from "node:assert";

import { InlayHintKind } from "vscode-languageserver-types";
import { getCSSLanguageService, TextDocument } from "../../cssLanguageService.js";
import * as nodes from "../../parser/cssNodes.js";

const languageService = getCSSLanguageService();

function createDocument(code: string): TextDocument {
	return TextDocument.create("test://test/test.css", "css", 0, code);
}

function createStylesheet(code: string): nodes.Stylesheet {
	const document = createDocument(code);
	return languageService.parseStylesheet(document) as unknown as nodes.Stylesheet;
}

function createDocumentAndStylesheet(code: string): { document: TextDocument; stylesheet: nodes.Stylesheet } {
	const document = createDocument(code);
	return {
		document,
		stylesheet: languageService.parseStylesheet(document) as unknown as nodes.Stylesheet,
	};
}

function findMarkerOffset(code: string, marker = "|"): number {
	const offset = code.indexOf(marker);
	assert.ok(offset !== -1, `${marker} missing in test input`);
	return offset;
}

function stripMarker(code: string, marker = "|"): { text: string; offset: number } {
	const offset = findMarkerOffset(code, marker);
	return {
		text: code.slice(0, offset) + code.slice(offset + marker.length),
		offset,
	};
}

function assertParsed(code: string): nodes.Stylesheet {
	const { stylesheet } = createDocumentAndStylesheet(code);
	assert.equal(nodes.ParseErrorCollector.entries(stylesheet).length, 0, "expected no parse errors");
	return stylesheet;
}

suite("CSS - Inlay Hints", () => {
	test("parses the minimal fixture", () => {
		const stylesheet = assertParsed(".foo { color: red; }");
		assert.ok(stylesheet);
	});

	test("plumbs the CSS inlay hint entry", () => {
		const document = createDocument(".foo { unknown: red; }");
		const stylesheet = languageService.parseStylesheet(document) as unknown as nodes.Stylesheet;
		assert.ok(languageService.doInlayHints);
		assert.deepEqual(languageService.doInlayHints(document, stylesheet), []);
	});

	test("emits a value-kind hint for single restriction properties", () => {
		const source = ".foo { border-top-width: 1px; }";
		const document = createDocument(source);
		const stylesheet = languageService.parseStylesheet(document) as unknown as nodes.Stylesheet;
		const hints = languageService.doInlayHints!(document, stylesheet);

		assert.equal(hints.length, 1);
		assert.deepEqual(hints[0].position, document.positionAt(source.indexOf("1px")));
		assert.equal(hints[0].label, "line-width:");
		assert.equal(hints[0].kind, InlayHintKind.Type);
		assert.equal(hints[0].paddingRight, true);
		assert.equal(hints[0].paddingLeft, false);
	});

	test("emits role hints for box shorthands with multiple values", () => {
		const source = ".foo { padding: 1px 2px; }";
		const document = createDocument(source);
		const stylesheet = languageService.parseStylesheet(document) as unknown as nodes.Stylesheet;
		const hints = languageService.doInlayHints!(document, stylesheet);

		assert.equal(hints.length, 2);
		assert.deepEqual(hints[0].position, document.positionAt(source.indexOf("1px")));
		assert.equal(hints[0].label, "top/bottom:");
		assert.equal(hints[0].kind, InlayHintKind.Parameter);
		assert.equal(hints[0].paddingRight, true);
		assert.deepEqual(hints[1].position, document.positionAt(source.indexOf("2px")));
		assert.equal(hints[1].label, "right/left:");
		assert.equal(hints[1].kind, InlayHintKind.Parameter);
		assert.equal(hints[1].paddingRight, true);
	});

	test("does not emit box shorthand hints for a single value", () => {
		const source = ".foo { padding: 1px; }";
		const document = createDocument(source);
		const stylesheet = languageService.parseStylesheet(document) as unknown as nodes.Stylesheet;
		const hints = languageService.doInlayHints!(document, stylesheet);

		assert.deepEqual(hints, []);
	});

	test.todo("property value hints are emitted for stable declarations");
	test.todo("shorthand components are hinted with stable labels");
	test.todo("left-side hints are used for role labels");
	test.todo("right-side hints are used for result summaries");
	test.todo("block-end hints are emitted only for stable block endings");
	test.todo("explicit source text suppresses redundant hints");
	test.todo("duplicate candidates are deduplicated");
	test.todo("configuration can disable all CSS inlay hints");
	test.todo("range-restricted requests only emit hints inside the requested range");
	test.todo("large declarations do not emit low-value hints");
});

suite("CSS - Inlay Hint Test Helpers", () => {
	test("stripMarker removes the marker and preserves the offset", () => {
		const result = stripMarker(".foo { co|lor: red; }");
		assert.equal(result.text, ".foo { color: red; }");
		assert.equal(result.offset, ".foo { co".length);
	});

	test("createStylesheet builds a stylesheet for valid CSS", () => {
		const stylesheet = createStylesheet(".foo { color: red; }");
		assert.ok(stylesheet);
	});
});
