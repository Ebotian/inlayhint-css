"use strict";

import * as nodes from "../parser/cssNodes.js";
import { CSSDataManager } from "../languageFacts/dataManager.js";
import { InlayHint, InlayHintKind } from "vscode-languageserver-types";
import { Range, TextDocument } from "../cssLanguageTypes.js";

export interface CSSInlayHintSettings {
	enabled?: boolean;
	minimumBlockLines?: number;
}

export interface CSSInlayHintContext {
	document: TextDocument;
	stylesheet: nodes.Stylesheet;
	settings: Required<CSSInlayHintSettings>;
	requestRange?: Range;
}

interface CSSInlayHintCandidate {
	range: Range;
	label: string;
	kind: InlayHintKind;
	paddingLeft?: boolean;
	paddingRight?: boolean;
}

const boxShorthandProperties = new Set(["margin", "padding", "border-width"]);

const defaultSettings: Required<CSSInlayHintSettings> = {
	enabled: true,
	minimumBlockLines: 3,
};

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

		const context: CSSInlayHintContext = {
			document,
			stylesheet,
			settings,
			requestRange,
		};

		const candidates = this.collectCandidates(context);
		return this.renderCandidates(candidates, context);
	}

	protected collectCandidates(context: CSSInlayHintContext): CSSInlayHintCandidate[] {
		const candidates: CSSInlayHintCandidate[] = [];

		context.stylesheet.accept((node) => {
			if (node instanceof nodes.Declaration) {
				this.collectDeclarationCandidates(node, context, candidates);
				return true;
			}

			if (node instanceof nodes.RuleSet) {
				this.collectRuleSetCandidates(node, context, candidates);
				return true;
			}

			return true;
		});

		return candidates;
	}

	protected collectDeclarationCandidates(
		declaration: nodes.Declaration,
		context: CSSInlayHintContext,
		candidates: CSSInlayHintCandidate[],
	): void {
		const property = declaration.getProperty();
		const value = declaration.getValue();
		if (!property || !value) {
			return;
		}

		const propertyName = declaration.getNonPrefixedPropertyName();
		if (this.collectBoxShorthandCandidates(propertyName, value, context, candidates)) {
			return;
		}

		const propertyData = this.cssDataManager.getProperty(propertyName);
		if (!propertyData || propertyData.restrictions?.length !== 1) {
			return;
		}

		if (boxShorthandProperties.has(propertyName)) {
			return;
		}

		const restriction = propertyData.restrictions[0];
		if (value.getChildren().length !== 1) {
			return;
		}

		const range = this.rangeFromOffset(context.document, value.offset);
		if (!this.isRangeInsideRequest(range, context.requestRange)) {
			return;
		}

		candidates.push(this.createCandidate(range, `${restriction}:`, InlayHintKind.Type, false, true));
	}

	protected collectBoxShorthandCandidates(
		propertyName: string,
		value: nodes.Expression,
		context: CSSInlayHintContext,
		candidates: CSSInlayHintCandidate[],
	): boolean {
		if (!boxShorthandProperties.has(propertyName)) {
			return false;
		}

		const children = value.getChildren();
		const labels = this.getBoxShorthandLabels(children.length);
		if (!labels) {
			return true;
		}

		for (let index = 0; index < children.length; index++) {
			const child = children[index];
			const label = labels[index];
			const range = this.rangeFromOffset(context.document, child.offset);
			if (!this.isRangeInsideRequest(range, context.requestRange)) {
				continue;
			}

			candidates.push(this.createCandidate(range, `${label}:`, InlayHintKind.Parameter, false, true));
		}

		return true;
	}

	protected getBoxShorthandLabels(valueCount: number): string[] | null {
		switch (valueCount) {
			case 2:
				return ["top/bottom", "right/left"];
			case 3:
				return ["top", "right/left", "bottom"];
			case 4:
				return ["top", "right", "bottom", "left"];
			default:
				return null;
		}
	}

	protected collectRuleSetCandidates(
		ruleSet: nodes.RuleSet,
		context: CSSInlayHintContext,
		candidates: CSSInlayHintCandidate[],
	): void {
		void ruleSet;
		void context;
		void candidates;
	}

	protected renderCandidates(candidates: CSSInlayHintCandidate[], context: CSSInlayHintContext): InlayHint[] {
		return candidates
			.filter((candidate) => this.isRangeInsideRequest(candidate.range, context.requestRange))
			.map((candidate) => this.createHint(candidate))
			.filter((hint): hint is InlayHint => hint !== null);
	}

	protected createHint(candidate: CSSInlayHintCandidate): InlayHint | null {
		if (!this.isValidCandidate(candidate)) {
			return null;
		}

		return {
			position: candidate.range.start,
			label: candidate.label,
			kind: candidate.kind,
			paddingLeft: candidate.paddingLeft,
			paddingRight: candidate.paddingRight,
		};
	}

	protected isValidCandidate(candidate: CSSInlayHintCandidate): boolean {
		return candidate.label.length > 0 && this.isValidRange(candidate.range);
	}

	protected isValidRange(range: Range): boolean {
		return this.comparePositions(range.start, range.end) <= 0;
	}

	protected isRangeInsideRequest(range: Range, requestRange?: Range): boolean {
		if (!requestRange) {
			return true;
		}

		return (
			this.comparePositions(range.end, requestRange.start) >= 0 &&
			this.comparePositions(range.start, requestRange.end) <= 0
		);
	}

	protected comparePositions(
		left: { line: number; character: number },
		right: { line: number; character: number },
	): number {
		if (left.line !== right.line) {
			return left.line - right.line;
		}

		return left.character - right.character;
	}

	protected createCandidate(
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

	private rangeFromOffset(document: TextDocument, offset: number): Range {
		const position = document.positionAt(offset);
		return Range.create(position, position);
	}
}
