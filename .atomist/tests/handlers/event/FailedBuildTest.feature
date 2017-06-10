Feature: FailedBuild handler handles events
  This is the sample Gherkin feature file for the BDD tests of
  the sample TypeScript event handler used by AddFailedBuild.
  Feel free to modify and extend to suit the needs of your handler.


  Scenario: Executing a sample event handler
    Given the FailedBuild is registered
    When a new Build is received
    Then the FailedBuild event handler should respond with the correct message
