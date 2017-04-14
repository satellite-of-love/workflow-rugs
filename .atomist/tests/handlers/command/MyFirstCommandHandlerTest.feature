Feature: MyFirstCommandHandler handlers responds to commands
  The MyFirstCommandHandler command handler should
  respond with the appropriate message.
  This is a sample test.

  Scenario: Executing a sample command handler
    Given nothing
    When the MyFirstCommandHandler is invoked
    Then you get the right response
