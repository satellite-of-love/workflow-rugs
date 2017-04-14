Feature: MyFirstEventHandler handler handles events
  The MyFirstEventHandler event handler should
  respond with the appropriate message.
  This is a sample test.

  Scenario: Executing a sample event handler
    Given the MyFirstEventHandler is registered
    When a new Tag is received
    Then the event handler should respond with the correct message
