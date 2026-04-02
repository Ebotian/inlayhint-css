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

	test("emits role hints for border-width and border-style box shorthands", () => {
		const source = ".foo { border-width: 1px 2px 3px 4px; border-style: solid dashed; }";
		const document = createDocument(source);
		const stylesheet = languageService.parseStylesheet(document) as unknown as nodes.Stylesheet;
		const hints = languageService.doInlayHints!(document, stylesheet);

		assert.equal(hints.length, 6);
		assert.deepEqual(hints[0].position, document.positionAt(source.indexOf("1px")));
		assert.equal(hints[0].label, "top:");
		assert.equal(hints[0].kind, InlayHintKind.Parameter);
		assert.deepEqual(hints[1].position, document.positionAt(source.indexOf("2px")));
		assert.equal(hints[1].label, "right:");
		assert.equal(hints[1].kind, InlayHintKind.Parameter);
		assert.deepEqual(hints[2].position, document.positionAt(source.indexOf("3px")));
		assert.equal(hints[2].label, "bottom:");
		assert.equal(hints[2].kind, InlayHintKind.Parameter);
		assert.deepEqual(hints[3].position, document.positionAt(source.indexOf("4px")));
		assert.equal(hints[3].label, "left:");
		assert.equal(hints[3].kind, InlayHintKind.Parameter);
		assert.deepEqual(hints[4].position, document.positionAt(source.indexOf("solid")));
		assert.equal(hints[4].label, "top/bottom:");
		assert.equal(hints[4].kind, InlayHintKind.Parameter);
		assert.deepEqual(hints[5].position, document.positionAt(source.indexOf("dashed")));
		assert.equal(hints[5].label, "right/left:");
		assert.equal(hints[5].kind, InlayHintKind.Parameter);
	});

	test("emits role hints for border-color and border-radius box shorthands", () => {
		const source = ".foo { border-color: red green blue yellow; border-radius: 1px 2px 3px; }";
		const document = createDocument(source);
		const stylesheet = languageService.parseStylesheet(document) as unknown as nodes.Stylesheet;
		const hints = languageService.doInlayHints!(document, stylesheet);

		assert.equal(hints.length, 7);
		assert.deepEqual(hints[0].position, document.positionAt(source.indexOf("red")));
		assert.equal(hints[0].label, "top:");
		assert.deepEqual(hints[1].position, document.positionAt(source.indexOf("green")));
		assert.equal(hints[1].label, "right:");
		assert.deepEqual(hints[2].position, document.positionAt(source.indexOf("blue")));
		assert.equal(hints[2].label, "bottom:");
		assert.deepEqual(hints[3].position, document.positionAt(source.indexOf("yellow")));
		assert.equal(hints[3].label, "left:");
		assert.deepEqual(hints[4].position, document.positionAt(source.indexOf("1px")));
		assert.equal(hints[4].label, "top-left:");
		assert.deepEqual(hints[5].position, document.positionAt(source.indexOf("2px")));
		assert.equal(hints[5].label, "top-right/bottom-left:");
		assert.deepEqual(hints[6].position, document.positionAt(source.indexOf("3px")));
		assert.equal(hints[6].label, "bottom-right:");
	});

	test("emits an all hint for single-value box shorthands", () => {
		const source = ".foo { margin: 12px; }";
		const document = createDocument(source);
		const stylesheet = languageService.parseStylesheet(document) as unknown as nodes.Stylesheet;
		const hints = languageService.doInlayHints!(document, stylesheet);

		assert.equal(hints.length, 1);
		assert.deepEqual(hints[0].position, document.positionAt(source.indexOf("12px")));
		assert.equal(hints[0].label, "all:");
		assert.equal(hints[0].kind, InlayHintKind.Parameter);
		assert.equal(hints[0].paddingRight, true);
	});

	test("does not emit longhand hints for generic length or color restrictions", () => {
		const source = ".foo { padding-top: 12px; color: red; text-align: center; align-self: stretch; }";
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
