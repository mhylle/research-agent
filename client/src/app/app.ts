import { Component } from '@angular/core';
import { ResearchComponent } from './features/research/research';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ResearchComponent],
  template: '<app-research></app-research>',
  styles: []
})
export class AppComponent {}
