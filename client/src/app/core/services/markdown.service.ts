import { Injectable } from '@angular/core';
import { marked } from 'marked';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Injectable({
  providedIn: 'root'
})
export class MarkdownService {
  constructor(private sanitizer: DomSanitizer) {
    // Configure marked options
    marked.setOptions({
      gfm: true, // GitHub Flavored Markdown
      breaks: true, // Convert \n to <br>
    });
  }

  /**
   * Parse markdown string to HTML
   * @param markdown - The markdown string to parse
   * @returns Parsed HTML string
   */
  parse(markdown: string): string {
    if (!markdown) {
      return '';
    }
    return marked.parse(markdown) as string;
  }

  /**
   * Parse markdown string to safe HTML for use with [innerHTML]
   * @param markdown - The markdown string to parse
   * @returns SafeHtml that can be used with [innerHTML]
   */
  parseToSafeHtml(markdown: string): SafeHtml {
    const html = this.parse(markdown);
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
