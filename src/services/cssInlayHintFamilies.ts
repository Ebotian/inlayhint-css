"use strict";

type BoxFamilyDefinition = {
	properties: readonly string[];
	labelsByArity: readonly [number, readonly string[]][];
};

export const boxFamilyDefinitions: readonly BoxFamilyDefinition[] = [
	{
		properties: ["margin", "padding", "border-width", "border-style", "border-color"],
		labelsByArity: [
			[1, ["all"]],
			[2, ["top/bottom", "right/left"]],
			[3, ["top", "right/left", "bottom"]],
			[4, ["top", "right", "bottom", "left"]],
		],
	},
	{
		properties: ["border-radius"],
		labelsByArity: [
			[1, ["all"]],
			[2, ["top-left/bottom-right", "top-right/bottom-left"]],
			[3, ["top-left", "top-right/bottom-left", "bottom-right"]],
			[4, ["top-left", "top-right", "bottom-right", "bottom-left"]],
		],
	},
];

function hasProperty(definition: BoxFamilyDefinition, propertyName: string): boolean {
	return definition.properties.includes(propertyName);
}

export function isBoxHintProperty(propertyName: string): boolean {
	return boxFamilyDefinitions.some((family) => hasProperty(family, propertyName));
}

export function getBoxHintLabels(propertyName: string, valueCount: number): readonly string[] | null {
	const family = boxFamilyDefinitions.find((currentFamily) => hasProperty(currentFamily, propertyName));
	if (!family) {
		return null;
	}

	const labelsByArity = family.labelsByArity.find(([arity]) => arity === valueCount);
	return labelsByArity ? labelsByArity[1] : null;
}
