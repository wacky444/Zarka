import type { TutorialStepId } from "@shared";

const PRESENTATION_ONLY_STEP_IDS: readonly TutorialStepId[] = [
  "map_pan",
  "inspect_current_cell",
  "inspect_nearby_cell",
  "read_detective_result",
  "open_chat"
];
const PRESENTATION_AND_GAMEPLAY_STEP_IDS: readonly TutorialStepId[] = ["search"];

export class TutorialProgressController {
  private readonly observedGameplaySteps = new Set<TutorialStepId>();
  private readonly observedPresentationSteps = new Set<TutorialStepId>();
  private readonly completedSteps = new Set<TutorialStepId>();
  private currentStepIndex = 0;
  private readonly orderedSteps: readonly TutorialStepId[];

  constructor(orderedSteps: readonly TutorialStepId[]) {
    this.orderedSteps = orderedSteps;
  }

  get currentStep(): TutorialStepId | null {
    return this.orderedSteps[this.currentStepIndex] ?? null;
  }

  get isComplete(): boolean {
    return this.currentStep === null;
  }

  recordPresentation(stepId: TutorialStepId): boolean {
    const stepIndex = this.orderedSteps.indexOf(stepId);
    const requiresPresentation =
      PRESENTATION_ONLY_STEP_IDS.indexOf(stepId) !== -1 ||
      PRESENTATION_AND_GAMEPLAY_STEP_IDS.indexOf(stepId) !== -1;
    if (!requiresPresentation || stepIndex !== this.currentStepIndex) {
      return false;
    }

    this.observedPresentationSteps.add(stepId);
    return this.advanceReadySteps();
  }

  recordGameplay(stepId: TutorialStepId): boolean {
    if (PRESENTATION_ONLY_STEP_IDS.indexOf(stepId) !== -1) {
      return false;
    }

    const stepIndex = this.orderedSteps.indexOf(stepId);
    if (stepIndex < this.currentStepIndex || stepIndex === -1) {
      return false;
    }

    this.observedGameplaySteps.add(stepId);
    return this.advanceReadySteps();
  }

  hasObservedGameplayStep(stepId: TutorialStepId): boolean {
    return this.observedGameplaySteps.has(stepId);
  }

  hasCompletedStep(stepId: TutorialStepId): boolean {
    return this.completedSteps.has(stepId);
  }

  private advanceReadySteps(): boolean {
    let advanced = false;
    let currentStep = this.currentStep;
    while (currentStep) {
      const requiresPresentation =
        PRESENTATION_ONLY_STEP_IDS.indexOf(currentStep) !== -1 ||
        PRESENTATION_AND_GAMEPLAY_STEP_IDS.indexOf(currentStep) !== -1;
      const requiresGameplay =
        PRESENTATION_ONLY_STEP_IDS.indexOf(currentStep) === -1;
      if (
        (requiresPresentation &&
          !this.observedPresentationSteps.has(currentStep)) ||
        (requiresGameplay && !this.observedGameplaySteps.has(currentStep))
      ) {
        break;
      }
      this.completedSteps.add(currentStep);
      this.currentStepIndex += 1;
      advanced = true;
      currentStep = this.currentStep;
    }
    return advanced;
  }
}
