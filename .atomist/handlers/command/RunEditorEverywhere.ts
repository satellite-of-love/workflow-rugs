import { HandleCommand, HandlerContext, ResponseMessage, Plan } from '@atomist/rug/operations/Handlers';
import { CommandHandler, Parameter, MappedParameter, Tags, Intent } from '@atomist/rug/operations/Decorators';
import { Pattern } from '@atomist/rug/operations/RugOperation';
import { Repo } from '@atomist/cortex/Repo';

/**
 * A sample Rug TypeScript command handler.
 */
@CommandHandler("RunEditorEverywhere", "list stuff that is my job to fix")
@Tags("workflow", "satellite-of-love", "rug")
@Intent("org-wide edit")
export class RunEditorEverywhere implements HandleCommand {

    @Parameter({
        displayName: "editor coordinate",
        description: "the (parameterless) editor to run, like satellite-of-love:atomist-k8-specs:ChangeMemoryRequirements",
        pattern: Pattern.any,
        validInput: "a description of the valid input",
        minLength: 1,
        maxLength: 100
    })
    editorName: string;

    handle(command: HandlerContext): Plan {
        let pxe = command.pathExpressionEngine;
        let plan = new Plan();

        // match (ct: ChatTeam { name: "satellite-of-love" } ) - [:OWNS] - (gh: Org) - [:HAS] - (r: Repo) return r

        pxe.with<Repo>(command.contextRoot, "/ChatTeam()/Org()/Repo()", r => {
            plan.add({
                instruction: { kind: "edit", name: this.editorName, project: r.name },
                onSuccess: new ResponseMessage("Created PR on " + r.name),
                onError: new ResponseMessage("Failed to edit " + r.name)
            });
        });

        return plan;
    }
}

export const runEditorEverywhere = new RunEditorEverywhere();
