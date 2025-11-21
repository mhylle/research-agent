import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-json-viewer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './json-viewer.html',
  styleUrls: ['./json-viewer.scss']
})
export class JsonViewerComponent {
  @Input() title = 'Data';
  @Input() data: any;

  isExpanded = false;
  showRaw = false;

  get formattedJson(): string {
    const json = JSON.stringify(this.data, null, 2);
    return this.syntaxHighlight(json);
  }

  get rawJson(): string {
    return JSON.stringify(this.data, null, 2);
  }

  get needsExpansion(): boolean {
    return this.rawJson.split('\n').length > 15;
  }

  get hasData(): boolean {
    return this.data !== null && this.data !== undefined;
  }

  private syntaxHighlight(json: string): string {
    return json.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (match) => {
        let cls = 'json-number';
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'json-key';
          } else {
            cls = 'json-string';
          }
        } else if (/true|false/.test(match)) {
          cls = 'json-boolean';
        } else if (/null/.test(match)) {
          cls = 'json-null';
        }
        return `<span class="${cls}">${match}</span>`;
      }
    );
  }

  copyJson(): void {
    navigator.clipboard.writeText(this.rawJson).then(() => {
      alert('Copied to clipboard!');
    });
  }

  expand(): void {
    this.isExpanded = true;
  }

  toggleRaw(): void {
    this.showRaw = !this.showRaw;
  }
}
