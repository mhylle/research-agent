import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ToolNode } from './tool-node';

describe('ToolNode', () => {
  let component: ToolNode;
  let fixture: ComponentFixture<ToolNode>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToolNode]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ToolNode);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
