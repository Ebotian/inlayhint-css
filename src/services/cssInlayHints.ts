"use strict";

import * as nodes from "../parser/cssNodes.js";
import { CSSDataManager } from "../languageFacts/dataManager.js";
import { InlayHint, InlayHintKind } from "vscode-languageserver-types";
import { Range, TextDocument } from "../cssLanguageTypes.js";
import { getBoxHintLabels, isBoxHintProperty } from "./cssInlayHintFamilies.js";

export interface CSSInlayHintSettings {
	enabled?: boolean;
	minimumBlockLines?: number;
}

interface CSSInlayHintCandidate {
	range: Range;
	label: string;
	kind: InlayHintKind;
	paddingLeft?: boolean;
	paddingRight?: boolean;
}

const meaningfulLonghandRestrictions = ["line-width"] as const;

const defaultSettings: Required<CSSInlayHintSettings> = {
	enabled: true,
	minimumBlockLines: 3,
};

function isMeaningfulLonghandRestriction(restriction: string): boolean {
	return meaningfulLonghandRestrictions.includes(restriction as (typeof meaningfulLonghandRestrictions)[number]);
}

function isRangeInsideRequest(range: Range, requestRange?: Range): boolean {
	if (!requestRange) {
		return true;
	}

	const endsAfterRequestStart =
		range.end.line > requestRange.start.line ||
		(range.end.line === requestRange.start.line && range.end.character >= requestRange.start.character);
	const startsBeforeRequestEnd =
		range.start.line < requestRange.end.line ||
		(range.start.line === requestRange.end.line && range.start.character <= requestRange.end.character);

	return endsAfterRequestStart && startsBeforeRequestEnd;
}

function createCandidate(
	range: Range,
	label: string,
	kind: InlayHintKind,
	paddingLeft = false,
	paddingRight = false,
): CSSInlayHintCandidate {
	return {
		range,
		label,
		kind,
		paddingLeft,
		paddingRight,
	};
}

function renderCandidates(candidates: CSSInlayHintCandidate[], requestRange?: Range): InlayHint[] {
	return candidates.flatMap((candidate) => {
		if (!isRangeInsideRequest(candidate.range, requestRange)) {
			return [];
		}

		return [
			{
				position: candidate.range.start,
				label: candidate.label,
				kind: candidate.kind,
				paddingLeft: candidate.paddingLeft,
				paddingRight: candidate.paddingRight,
			},
		];
	});
}

function rangeFromOffset(document: TextDocument, offset: number): Range {
	const position = document.positionAt(offset);
	return Range.create(position, position);
}

function collectBoxFamilyCandidates(
	propertyName: string,
	value: nodes.Expression,
	document: TextDocument,
): CSSInlayHintCandidate[] {
	if (!isBoxHintProperty(propertyName)) {
		return [];
	}

	const children = value.getChildren();
	const labels = getBoxHintLabels(propertyName, children.length);
	if (!labels) {
		return [];
	}

	return children.map((child, index) => {
		const range = rangeFromOffset(document, child.offset);
		return createCandidate(range, `${labels[index]}:`, InlayHintKind.Parameter, false, true);
	});
}

function collectDeclarationCandidates(
	declaration: nodes.Declaration,
	document: TextDocument,
	getProperty: (propertyName: string) => ReturnType<CSSDataManager["getProperty"]>,
): CSSInlayHintCandidate[] {
	const property = declaration.getProperty();
	const value = declaration.getValue();
	if (!property || !value) {
		return [];
	}

	const propertyName = declaration.getNonPrefixedPropertyName();
	if (isBoxHintProperty(propertyName)) {
		return collectBoxFamilyCandidates(propertyName, value, document);
	}

	const propertyData = getProperty(propertyName);
	const restriction = propertyData?.restrictions?.find((currentRestriction) =>
		isMeaningfulLonghandRestriction(currentRestriction),
	);
	if (!restriction || value.getChildren().length !== 1) {
		return [];
	}

	const range = rangeFromOffset(document, value.offset);
	return [createCandidate(range, `${restriction}:`, InlayHintKind.Type, false, true)];
}

function collectCandidates(
	stylesheet: nodes.Stylesheet,
	document: TextDocument,
	getProperty: (propertyName: string) => ReturnType<CSSDataManager["getProperty"]>,
): CSSInlayHintCandidate[] {
	const candidates: CSSInlayHintCandidate[] = [];

	stylesheet.accept((node) => {
		if (node instanceof nodes.Declaration) {
			candidates.push(...collectDeclarationCandidates(node, document, getProperty));
		}

		return true;
	});

	return candidates;
}

export class CSSInlayHints {
	constructor(private readonly cssDataManager: CSSDataManager) {}

	private settings = defaultSettings;

	public configure(settings?: CSSInlayHintSettings): void {
		this.settings = {
			...defaultSettings,
			...settings,
		};
	}

	public doInlayHints(
		document: TextDocument,
		stylesheet: nodes.Stylesheet,
		requestRange?: Range,
		settings = this.settings,
	): InlayHint[] {
		if (!settings.enabled) {
			return [];
		}

		const candidates = collectCandidates(stylesheet, document, (propertyName) =>
			this.cssDataManager.getProperty(propertyName),
		);
		return renderCandidates(candidates, requestRange);
	}
}
