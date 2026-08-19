import { Header } from "../components/Header";

export function formatTitle(input: string): string {
  return input.toUpperCase();
}

export function isTitleValid(input: string): boolean {
  return input.length > 0;
}

export function describeHeader(): string {
  return Header.name;
}
