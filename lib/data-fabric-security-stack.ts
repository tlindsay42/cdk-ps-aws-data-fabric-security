import { NestedStack, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";

import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as route53 from "aws-cdk-lib/aws-route53";
import * as logs from "aws-cdk-lib/aws-logs";

import { DataFabricSecurityStackProps } from "./props/stack-props";

export class DataFabricSecurityStack extends NestedStack {
  private readonly coreId: any;
  private readonly commonName: string;

  public readonly vpc: ec2.IVpc;
  public readonly subnets: ec2.ISubnet[]=[];
  public readonly privateZone: route53.IPrivateHostedZone;

  constructor(scope: Construct, id: string, props: DataFabricSecurityStackProps) {
    super(scope, id, props);

    this.coreId = (id: string) => `${props.prefix}-${id}`;
    this.commonName = props.prefix;
    
    if(props.vpc.vpcId == "" && !props.vpc.vpcId) {
      const cwLogs = new logs.LogGroup(this, 'Log', {
        logGroupName: `/aws/${this.commonName}-vpc/flowlogs`,
        removalPolicy: RemovalPolicy.DESTROY,
      });

      this.vpc = new ec2.Vpc(this, this.coreId('vpc'), {
        vpcName: this.coreId('vpc'), 
        maxAzs: props.vpc.maxAZs,
        flowLogs: {
          's3': {
            destination: ec2.FlowLogDestination.toCloudWatchLogs(cwLogs),
            trafficType: ec2.FlowLogTrafficType.ALL,
          },
        }
      });

      this.subnets = this.vpc.privateSubnets;
    } else {
      this.vpc = ec2.Vpc.fromLookup(this, this.coreId('import-vpc'), {
        vpcId: props.vpc.vpcId,
        isDefault: false,
      });
      for (let i in props.vpc.subnetIds) {
        this.subnets.push(ec2.Subnet.fromSubnetId(this,`subnet${i}` , props.vpc.subnetIds[i]))
      }
    }

    new ec2.InterfaceVpcEndpoint(scope, this.coreId('eks-endpoint'), {
      vpc: this.vpc,
      service: new ec2.InterfaceVpcEndpointService(`com.amazonaws.${props.env.region}.eks`, 443),
      subnets: {
        subnets: this.subnets
      },
      privateDnsEnabled: true
    });

    new ec2.InterfaceVpcEndpoint(scope, this.coreId('lambda-endpoint'), {
      vpc: this.vpc,
      service: new ec2.InterfaceVpcEndpointService(`com.amazonaws.${props.env.region}.lambda`, 443),
      subnets: {
        subnets: this.subnets
      },
      privateDnsEnabled: true
    });

    this.privateZone = new route53.PrivateHostedZone(this, this.coreId('hosted-zone'), {
      zoneName: props.domain,
      vpc: this.vpc
    });
  }
}
