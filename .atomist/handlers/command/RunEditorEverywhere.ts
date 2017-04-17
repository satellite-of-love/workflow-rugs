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
        displayName: "rug archive holding this generator",
        description: "workflow-rugs or rest-service-generator",
        pattern: Pattern.project_name,
        validInput: "workflow-rugs or rest-service-generator"
    })
    rugArchive: string;

    @Parameter({
        displayName: "editor name",
        description: "the (parameterless) editor to run, like ChangeMemoryRequirements",
        pattern: Pattern.project_name,
        validInput: "a description of the valid input"
    })
    editorName: string;

    handle(command: HandlerContext): Plan {
        let pxe = command.pathExpressionEngine;
        let plan = new Plan();

        // match (ct: ChatTeam { name: "satellite-of-love" } ) - [:OWNS] - (gh: Org) - [:HAS] - (r: Repo) return r

        pxe.with<Repo>(command.contextRoot, "/ChatTeam()/Org()/Repo()", r => {
            plan.add(new ResponseMessage(`Running ${this.editorName} on ${r.name}`))
            plan.add({
                instruction: {
                    kind: "edit", name:
                        {
                            name: this.editorName,
                            group: "satellite-of-love",
                            artifact: this.rugArchive
                        }, project: r.name
                },
                onSuccess: new ResponseMessage("Created PR on " + r.name),
                onError: new ResponseMessage("Failed to edit " + r.name)
            });
        });

        return plan;
    }
}

export const runEditorEverywhere = new RunEditorEverywhere();
