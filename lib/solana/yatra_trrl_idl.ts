export const YatraTrrlIDL: any = {
  version: '0.1.0',
  name: 'yatra_trrl',
  instructions: [
    {
      name: 'updateRep',
      accounts: [
        { name: 'driverRep', isMut: true, isSigner: false },
        { name: 'authority', isMut: true, isSigner: true },
        { name: 'driver', isMut: false, "isSigner": false }
      ],
      args: [
        {
          name: 'telemetry',
          type: { defined: 'TripTelemetry' }
        }
      ]
    }
  ],
  types: [
    {
      name: 'TripTelemetry',
      type: {
        kind: 'struct',
        fields: [
          { name: 'isCompleted', type: 'bool' },
          { name: 'fidelityX100', type: 'u16' },
          { name: 'arrivalDeltaS', type: 'i16' },
          { name: 'hardBrakes', type: 'u8' },
          { name: 'deviations', type: 'u8' },
          { name: 'sosTriggered', type: 'u8' }
        ]
      }
    }
  ]
};
