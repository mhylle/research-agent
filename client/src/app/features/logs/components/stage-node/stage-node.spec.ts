import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StageNode } from './stage-node';

describe('StageNode', () => {
  let component: StageNode;
  let fixture: ComponentFixture<StageNode>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StageNode]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StageNode);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
